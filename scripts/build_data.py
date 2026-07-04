#!/usr/bin/env python3
"""Build dashboard JSON from Kaggle conflict data + GlobalMilitary.net missile inventories."""

from __future__ import annotations

import ast
import csv
import json
import math
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = Path(__file__).resolve().parent / "globalmilitary_seed.json"
BOMBS_SEED_PATH = Path(__file__).resolve().parent / "globalmilitary_bombs_seed.json"
OUT_DIR = ROOT / "web" / "public" / "data"
CONFLICT_COUNTRIES = {"Iran", "Israel"}
US_ACTION_CATEGORIES = {
    "US Military Action",
    "US Military Threat",
    "US Policy",
    "US Political Action",
}
TIMELINE_CSV = ROOT / "data" / "iran-usa" / "iran_usa_conflict_2023_2026.csv"
TIMELINE_ZIP = ROOT / "data" / "iran-usa-conflict.zip"
COALITION_STRIKES_PATH = Path(__file__).resolve().parent / "coalition_strikes_seed.json"
OSINT_BASE = "https://raw.githubusercontent.com/danielrosehill/Iran-Israel-War-2026-OSINT-Data/main/data"
OSINT_WAVES_URL = f"{OSINT_BASE}/waves.json"
OSINT_CACHE = ROOT / "data" / "osint" / "waves.json"
ISW_STRIKES_URL = (
    "https://services5.arcgis.com/SaBe5HMtmnbqSWlu/arcgis/rest/services/"
    "VIEW_V4_MDS_IranCrisisEvents2026/FeatureServer/46/query"
)
ISW_STORY_URL = "https://storymaps.arcgis.com/stories/089bc1a2fe684405a67d67f13bd31324"
ISW_CACHE = ROOT / "data" / "isw" / "us_israeli_strikes.json"

OPERATION_LABELS = {
    "tp1": "True Promise 1 (Apr 2024)",
    "tp2": "True Promise 2 (Oct 2024)",
    "tp3": "True Promise 3 (Jun 2025)",
    "tp4": "True Promise 4 (Feb–Mar 2026)",
}

WEAPON_TYPE_LABELS = {
    "emad_used": "Emad",
    "ghadr_used": "Ghadr",
    "sejjil_used": "Sejjil",
    "kheibar_shekan_used": "Kheibar Shekan",
    "fattah_used": "Fattah",
    "shahed_136_used": "Shahed-136",
    "shahed_238_used": "Shahed-238",
    "shahed_131_used": "Shahed-131",
    "shahed_107_used": "Shahed-107",
    "shahed_129_used": "Shahed-129",
    "mohajer_6_used": "Mohajer-6",
}

GM_MISSILE_ALIASES = {
    "Emad": "Emad",
    "Ghadr": "Ghadr-110",
    "Fattah": "Fattah-1",
    "Kheibar Shekan": "Kheibar / Khorramshahr-4",
}


def ensure_timeline_csv() -> Path:
    if TIMELINE_CSV.exists():
        return TIMELINE_CSV
    if not TIMELINE_ZIP.exists():
        print(
            "Missing timeline dataset. Download with:\n"
            '  curl -sL "https://www.kaggle.com/api/v1/datasets/download/'
            'muhammadshayan5839/iran-usa-conflict-2023-2026" -o data/iran-usa-conflict.zip',
            file=sys.stderr,
        )
        sys.exit(1)
    TIMELINE_CSV.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(TIMELINE_ZIP) as zf:
        zf.extractall(TIMELINE_CSV.parent)
    return TIMELINE_CSV


def _timeline_sort_key(date_text: str, year: str, index: int) -> int:
    """Approximate chronological ordering; ranges use start month when parseable."""
    base = int(year) * 10000
    month_map = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    }
    lower = date_text.lower()
    month = 1
    day = index + 1
    for name, num in month_map.items():
        if name in lower:
            month = num
            break
    day_match = re.search(r"\b(\d{1,2})\b", date_text)
    if day_match:
        day = int(day_match.group(1))
    return base + month * 100 + day


def _timeline_tags(category: str, actors: str) -> dict[str, bool]:
    actors_lower = actors.lower()
    category_lower = category.lower()
    return {
        "isUsAction": category in US_ACTION_CATEGORIES or "united states" in actors_lower,
        "isUsStrike": category == "US Military Action",
        "involvesIran": "iran" in actors_lower or "iran" in category_lower,
        "involvesIsrael": "israel" in actors_lower or "israel" in category_lower,
        "involvesUs": "united states" in actors_lower or "us " in category_lower or category.startswith("US "),
    }


def load_timeline_events() -> list[dict[str, Any]]:
    path = ensure_timeline_csv()
    events: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for index, row in enumerate(csv.DictReader(handle)):
            category = row["Category"].strip()
            actors = row["Key Actors"].strip()
            tags = _timeline_tags(category, actors)
            events.append(
                {
                    "id": index,
                    "date": row["Date"].strip(),
                    "year": int(row["Year"]),
                    "event": row["Event"].strip(),
                    "category": category,
                    "keyActors": actors,
                    "location": row["Location"].strip(),
                    "description": row["Description"].strip(),
                    "impactOutcome": row["Impact/Outcome"].strip(),
                    "sortKey": _timeline_sort_key(row["Date"], row["Year"], index),
                    **tags,
                }
            )
    events.sort(key=lambda e: (e["sortKey"], e["id"]))
    return events


def build_timeline_stats(events: list[dict[str, Any]]) -> dict[str, Any]:
    by_category: dict[str, int] = {}
    for event in events:
        by_category[event["category"]] = by_category.get(event["category"], 0) + 1
    us_strikes = [e for e in events if e["isUsStrike"]]
    return {
        "totalEvents": len(events),
        "usStrikeEvents": len(us_strikes),
        "usStrikeNames": [e["event"] for e in us_strikes],
        "byCategory": by_category,
    }


def link_timeline_to_conflict(
    events: list[dict[str, Any]], conflict: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Attach nearby quantitative conflict rows to 2026 timeline events when dates align."""
    conflict_by_month: dict[str, list[dict[str, Any]]] = {}
    for row in conflict:
        key = row["date"][:7]
        conflict_by_month.setdefault(key, []).append(row)

    linked: list[dict[str, Any]] = []
    for event in events:
        entry = dict(event)
        entry["relatedStats"] = []
        if event["year"] == 2026 and "february" in event["date"].lower():
            entry["relatedStats"] = conflict_by_month.get("2026-02", [])
        elif event["year"] == 2026 and "march" in event["date"].lower():
            entry["relatedStats"] = conflict_by_month.get("2026-03", [])
        linked.append(entry)
    return linked


def fetch_osint_waves() -> dict[str, Any]:
    OSINT_CACHE.parent.mkdir(parents=True, exist_ok=True)
    if not OSINT_CACHE.exists():
        print(f"Fetching OSINT waves from {OSINT_WAVES_URL}")
        with urllib.request.urlopen(OSINT_WAVES_URL, timeout=60) as response:
            OSINT_CACHE.write_bytes(response.read())
    return json.loads(OSINT_CACHE.read_text())


def _weapon_types_used(types: dict[str, Any] | None) -> list[str]:
    if not types:
        return []
    return [WEAPON_TYPE_LABELS[key] for key in WEAPON_TYPE_LABELS if types.get(key)]


def _match_globalmilitary(weapon_labels: list[str], missiles: list[dict[str, Any]]) -> list[dict[str, str]]:
    matches: list[dict[str, str]] = []
    matched_names: set[str] = set()
    for label in weapon_labels:
        gm_name = GM_MISSILE_ALIASES.get(label, label)
        found = False
        for missile in missiles:
            if missile["name"] == gm_name or gm_name in missile["name"] or label in missile["name"]:
                if missile["name"] not in matched_names:
                    matches.append({"label": label, "name": missile["name"], "sourceUrl": missile["sourceUrl"]})
                    matched_names.add(missile["name"])
                found = True
                break
        if not found:
            for missile in missiles:
                if missile["name"] == gm_name:
                    if missile["name"] not in matched_names:
                        matches.append({"label": label, "name": missile["name"], "sourceUrl": missile["sourceUrl"]})
                        matched_names.add(missile["name"])
                    break
    return matches


def normalize_osint_incident(incident: dict[str, Any], missiles: list[dict[str, Any]]) -> dict[str, Any]:
    timing = incident.get("timing") or {}
    weapons = incident.get("weapons") or {}
    targets = incident.get("targets") or {}
    interception = incident.get("interception") or {}
    munitions = incident.get("munitions") or {}
    impact = incident.get("impact") or {}
    sources = incident.get("sources") or {}
    intercepted_by = interception.get("intercepted_by") or {}
    weapon_labels = _weapon_types_used(weapons.get("types"))

    launch_site = incident.get("launch_site") or {}
    target_coords = (targets.get("target_coordinates") or {}) if targets else {}

    return {
        "id": f"{incident.get('operation')}-{incident.get('wave_number')}-{incident.get('sequence')}",
        "operation": incident.get("operation"),
        "operationLabel": OPERATION_LABELS.get(incident.get("operation", ""), incident.get("operation")),
        "waveNumber": incident.get("wave_number"),
        "sequence": incident.get("sequence"),
        "codenameEnglish": incident.get("wave_codename_english"),
        "description": incident.get("description"),
        "launchTimeUtc": timing.get("probable_launch_time") or timing.get("announced_utc"),
        "conflictDay": timing.get("conflict_day"),
        "launchLat": launch_site.get("lat"),
        "launchLon": launch_site.get("lon"),
        "launchSiteDesc": launch_site.get("description"),
        "targetLat": target_coords.get("lat"),
        "targetLon": target_coords.get("lon"),
        "payload": weapons.get("payload"),
        "weaponTypes": weapon_labels,
        "ballisticUsed": weapons.get("ballistic_missiles_used"),
        "cruiseUsed": weapons.get("cruise_missiles_used"),
        "dronesUsed": weapons.get("drones_used"),
        "clusterWarhead": (weapons.get("cluster_warhead") or {}).get("confirmed")
        if isinstance(weapons.get("cluster_warhead"), dict)
        else weapons.get("categories", {}).get("bm_cluster_warhead"),
        "munitionsCount": munitions.get("estimated_munitions_count"),
        "munitionsTargetingIsrael": munitions.get("munitions_targeting_israel"),
        "munitionsTargetingUsBases": munitions.get("munitions_targeting_us_bases"),
        "israelTargeted": targets.get("israel_targeted"),
        "usBasesTargeted": targets.get("us_bases_targeted"),
        "targets": targets.get("targets"),
        "landingsCountries": targets.get("landings_countries") or [],
        "usBases": [b.get("name") for b in (targets.get("us_bases") or []) if b.get("name")],
        "intercepted": interception.get("intercepted"),
        "interceptionSystems": interception.get("interception_systems") or [],
        "interceptRate": _rate_to_percent(interception.get("estimated_intercept_rate")),
        "interceptCount": interception.get("estimated_intercept_count"),
        "interceptionReport": interception.get("interception_report"),
        "threatClasses": _classify_threat_classes(weapons),
        "primaryThreatClass": (_classify_threat_classes(weapons) or ["unknown"])[0],
        "interceptedByUs": intercepted_by.get("us"),
        "fatalities": impact.get("fatalities"),
        "injuries": impact.get("injuries"),
        "damage": impact.get("damage"),
        "idfStatement": sources.get("idf_statement"),
        "sourceUrls": sources.get("urls") or [],
        "inventoryMatches": _match_globalmilitary(weapon_labels, missiles),
    }


def _rate_to_percent(rate: float | None) -> float | None:
    if rate is None:
        return None
    return round(rate * 100, 1) if rate <= 1 else round(rate, 1)


def _parse_intercept_rate_from_text(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:interception|intercepted|of incoming)", text, re.I)
    if match:
        return float(match.group(1))
    return None


def _classify_threat_classes(weapons: dict[str, Any]) -> list[str]:
    """Primary threat categories for interception analysis (a wave may span multiple)."""
    types = weapons.get("types") or {}
    categories = weapons.get("categories") or {}
    classes: list[str] = []
    if types.get("fattah_used") or categories.get("bm_hypersonic"):
        classes.append("hypersonic")
    if weapons.get("ballistic_missiles_used"):
        classes.append("ballistic")
    if weapons.get("cruise_missiles_used"):
        classes.append("cruise")
    if weapons.get("drones_used") or types.get("shahed_136_used") or types.get("shahed_238_used"):
        classes.append("drone")
    return classes or ["unknown"]


def _parse_payload_munitions(payload: str | None) -> dict[str, int | None]:
    if not payload:
        return {"drone": None, "cruise": None, "ballistic": None, "total": None}
    text = payload.lower()
    out: dict[str, int | None] = {"drone": None, "cruise": None, "ballistic": None, "total": None}

    drone_match = re.search(r"(\d+)\s+shahed", text)
    if drone_match:
        out["drone"] = int(drone_match.group(1))
    if out["drone"] is None:
        drone_match = re.search(r"(\d+)\s+(?:one-way attack )?drones?", text)
        if drone_match:
            out["drone"] = int(drone_match.group(1))
    cruise_match = re.search(r"(\d+)\s+(?:paveh\s+)?cruise", text)
    if cruise_match:
        out["cruise"] = int(cruise_match.group(1))
    bm_match = re.search(r"(\d+)\s+ballistic", text)
    if bm_match:
        out["ballistic"] = int(bm_match.group(1))

    total_match = re.search(r"~?(\d+)\s+ballistic missiles", text)
    if total_match and out["ballistic"] is None:
        out["ballistic"] = int(total_match.group(1))

    parts = [out[k] for k in ("drone", "cruise", "ballistic") if out[k]]
    if parts:
        out["total"] = sum(parts)
    return out


def _parse_intercept_report_counts(report: str | None) -> dict[str, int | None]:
    if not report:
        return {"drone": None, "ballistic": None}
    text = report.lower()
    out: dict[str, int | None] = {"drone": None, "ballistic": None}
    drone_match = re.search(r"(\d+)\s+(?:one-way attack )?drones?", text)
    if not drone_match:
        drone_match = re.search(r"more than (\d+)\s+(?:one-way attack )?drones?", text)
    if drone_match:
        out["drone"] = int(drone_match.group(1))
    bm_match = re.search(r"(\d+)\s+ballistic", text)
    if bm_match:
        out["ballistic"] = int(bm_match.group(1))
    return out


def _parse_impact_count_from_damage(damage: str | None) -> int | None:
    if not damage:
        return None
    match = re.search(r"(\d+)\s*[-–]\s*(\d+)\s+(?:distinct )?impact", damage.lower())
    if match:
        return int(match.group(2))
    match = re.search(r"(\d+)\s+(?:distinct )?impact", damage.lower())
    if match:
        return int(match.group(1))
    if "several impacts" in damage.lower():
        return 3
    return None


# OSINT-adjusted intercept benchmarks when per-sortie data is missing.
# Official IDF "99%" claims are shown separately; these reflect open-source/video skepticism.
CONTESTED_INTERCEPT_BENCHMARKS: dict[str, float] = {
    "drone": 55.0,
    "cruise": 30.0,
    "ballistic": 8.0,
    "hypersonic": 4.0,
    "unknown": 12.0,
}

THREAT_CLASS_LABELS: dict[str, str] = {
    "drone": "Loitering munitions / Shahed drones",
    "cruise": "Cruise missiles (Paveh, etc.)",
    "ballistic": "Ballistic missiles (Emad, Ghadr, Sejjil…)",
    "hypersonic": "Hypersonic / Fattah-class",
    "unknown": "Unclassified mixed salvo",
}

# Per-wave imputation when OSINT lacks explicit munition counts.
IMPUTE_BY_THREAT_CLASS: dict[str, int] = {
    "drone": 15,
    "cruise": 5,
    "ballistic": 4,
    "hypersonic": 3,
    "unknown": 6,
}

WEAPON_TYPE_TO_INVENTORY: dict[str, str] = {
    "Emad": "Emad",
    "Ghadr": "Ghadr-110",
    "Kheibar Shekan": "Kheibar / Khorramshahr-4",
    "Fattah": "Fattah-1",
}


def build_intercept_analytics(waves: list[dict[str, Any]]) -> dict[str, Any]:
    explicit_rates: list[float] = []
    idf_parsed_rates: list[float] = []
    weighted_num = 0.0
    weighted_den = 0.0
    munitions_total = 0
    intercept_count_total = 0
    by_operation: dict[str, dict[str, Any]] = {}

    for wave in waves:
        op = wave.get("operation") or "unknown"
        bucket = by_operation.setdefault(
            op,
            {
                "label": wave.get("operationLabel") or op,
                "waves": 0,
                "interceptedKnown": 0,
                "interceptedTrue": 0,
                "explicitRates": [],
                "munitions": 0,
            },
        )
        bucket["waves"] += 1

        if wave.get("intercepted") is not None:
            bucket["interceptedKnown"] += 1
            if wave.get("intercepted"):
                bucket["interceptedTrue"] += 1

        rate = wave.get("interceptRate")
        if rate is not None:
            explicit_rates.append(rate)
            bucket["explicitRates"].append(rate)

        mun = wave.get("munitionsCount")
        if mun:
            munitions_total += mun
            bucket["munitions"] += mun
            if rate is not None:
                weighted_num += rate * mun
                weighted_den += mun

        icount = wave.get("interceptCount")
        if icount:
            intercept_count_total += icount

        parsed = _parse_intercept_rate_from_text(wave.get("idfStatement"))
        if parsed is not None:
            idf_parsed_rates.append(parsed)

    intercepted_true = sum(1 for w in waves if w.get("intercepted") is True)
    intercepted_false = sum(1 for w in waves if w.get("intercepted") is False)
    intercepted_unknown = sum(1 for w in waves if w.get("intercepted") is None)
    known = intercepted_true + intercepted_false

    op_summary: dict[str, Any] = {}
    for op, bucket in by_operation.items():
        rates = bucket["explicitRates"]
        op_summary[op] = {
            "label": bucket["label"],
            "waves": bucket["waves"],
            "interceptedTrue": bucket["interceptedTrue"],
            "interceptedKnown": bucket["interceptedKnown"],
            "waveSuccessRate": round(bucket["interceptedTrue"] / bucket["interceptedKnown"] * 100, 1)
            if bucket["interceptedKnown"]
            else None,
            "meanExplicitRate": round(sum(rates) / len(rates), 1) if rates else None,
            "munitionsReported": bucket["munitions"],
        }

    # Weapon-class stratified intercept estimates
    class_stats: dict[str, dict[str, Any]] = {
        key: {
            "id": key,
            "label": THREAT_CLASS_LABELS[key],
            "waves": 0,
            "officialRates": [],
            "munitionsLaunched": 0,
            "munitionsInterceptedEst": 0,
            "parsedRates": [],
            "notes": [],
        }
        for key in THREAT_CLASS_LABELS
    }

    for wave in waves:
        payload_counts = _parse_payload_munitions(wave.get("payload"))
        report_counts = _parse_intercept_report_counts(
            wave.get("interceptionReport") or wave.get("interception_report")
        )
        impact_count = _parse_impact_count_from_damage(wave.get("damage"))
        classes = wave.get("threatClasses") or ["unknown"]

        for cls in classes:
            if cls not in class_stats:
                class_stats[cls] = {
                    "id": cls,
                    "label": THREAT_CLASS_LABELS.get(cls, cls),
                    "waves": 0,
                    "officialRates": [],
                    "munitionsLaunched": 0,
                    "munitionsInterceptedEst": 0,
                    "parsedRates": [],
                    "notes": [],
                }
            bucket = class_stats[cls]
            bucket["waves"] += 1

            if wave.get("interceptRate") is not None:
                bucket["officialRates"].append(wave["interceptRate"])

            launched = payload_counts.get(cls) if cls in payload_counts else None
            if launched is None and cls == "drone":
                launched = payload_counts.get("drone")
            if launched is None and wave.get("munitionsCount") and len(classes) == 1:
                launched = wave["munitionsCount"]

            intercepted = report_counts.get(cls if cls in report_counts else "drone" if cls == "drone" else "ballistic")
            if intercepted is not None and launched:
                bucket["parsedRates"].append(round(intercepted / launched * 100, 1))
                bucket["munitionsLaunched"] += launched
                bucket["munitionsInterceptedEst"] += intercepted
            elif launched:
                bench = CONTESTED_INTERCEPT_BENCHMARKS.get(cls, 12.0)
                bucket["munitionsLaunched"] += launched
                bucket["munitionsInterceptedEst"] += round(launched * bench / 100)

            if cls == "ballistic" and impact_count and payload_counts.get("ballistic"):
                bm_launched = payload_counts["ballistic"]
                leak_rate = round(impact_count / bm_launched * 100, 1)
                note = (
                    f"Satellite/OSINT: ≥{impact_count} impacts / {bm_launched} BM "
                    f"(≥{leak_rate}% leak-through) — contradicts 99% intercept claims"
                )
                if note not in bucket["notes"]:
                    bucket["notes"].append(note)

    by_threat_class: list[dict[str, Any]] = []
    contested_weight_num = 0.0
    contested_weight_den = 0.0

    for cls in ("drone", "cruise", "ballistic", "hypersonic", "unknown"):
        bucket = class_stats.get(cls)
        if not bucket or bucket["waves"] == 0:
            continue
        official_avg = (
            round(sum(bucket["officialRates"]) / len(bucket["officialRates"]), 1)
            if bucket["officialRates"]
            else None
        )
        parsed_avg = (
            round(sum(bucket["parsedRates"]) / len(bucket["parsedRates"]), 1)
            if bucket["parsedRates"]
            else None
        )
        if bucket["munitionsLaunched"] > 0:
            data_rate = round(bucket["munitionsInterceptedEst"] / bucket["munitionsLaunched"] * 100, 1)
        else:
            data_rate = None

        bench = CONTESTED_INTERCEPT_BENCHMARKS.get(cls, 12.0)
        if cls == "drone":
            contested = parsed_avg or data_rate or bench
        elif cls in ("ballistic", "hypersonic"):
            # Do not trust headline intercept % or naive impact/crater math for BMs.
            # Confirmed impacts imply high leak-through; cap contested rate at benchmark.
            contested = bench
            if parsed_avg is not None and parsed_avg < bench:
                contested = parsed_avg
        else:
            contested = parsed_avg or data_rate or bench

        if bucket["munitionsLaunched"] > 0:
            contested_weight_num += contested * bucket["munitionsLaunched"]
            contested_weight_den += bucket["munitionsLaunched"]

        by_threat_class.append(
            {
                "id": cls,
                "label": bucket["label"],
                "waves": bucket["waves"],
                "munitionsLaunched": bucket["munitionsLaunched"] or None,
                "officialRateAvg": official_avg,
                "parsedRateAvg": parsed_avg,
                "contestedRateEst": contested,
                "notes": bucket["notes"][:3],
            }
        )

    contested_overall = round(contested_weight_num / contested_weight_den, 1) if contested_weight_den else 12.0

    return {
        "wavesWithExplicitRate": len(explicit_rates),
        "wavesWithMunitionsCount": sum(1 for w in waves if w.get("munitionsCount")),
        "wavesWithInterceptCount": sum(1 for w in waves if w.get("interceptCount")),
        "interceptedWaveCount": intercepted_true,
        "notInterceptedWaveCount": intercepted_false,
        "unknownInterceptStatus": intercepted_unknown,
        "waveInterceptSuccessRate": round(intercepted_true / known * 100, 1) if known else None,
        "meanExplicitRate": round(sum(explicit_rates) / len(explicit_rates), 1) if explicit_rates else None,
        "munitionsWeightedRate": round(weighted_num / weighted_den, 1) if weighted_den else None,
        "idfStatementRates": idf_parsed_rates,
        "meanIdfStatementRate": round(sum(idf_parsed_rates) / len(idf_parsed_rates), 1)
        if idf_parsed_rates
        else None,
        "contestedOverallRate": contested_overall,
        "byThreatClass": by_threat_class,
        "totalMunitionsReported": munitions_total,
        "totalInterceptCountReported": intercept_count_total,
        "byOperation": op_summary,
        "methodologyNote": (
            "Official IDF/CENTCOM rates (often ~99%) reflect press statements, not per-sortie BDA. "
            "Contested estimates stratify by threat class: Shahed drones intercept better under saturation "
            "(~50–60% in TP1 CENTCOM math) than maneuvering ballistic (~5–8%) or Fattah hypersonic (~<10%). "
            "Where satellite impact counts exist (e.g. Nevatim 20–32 craters), those override headline claims. "
            "Video/OSINT suggests overall leak-through in the low teens — not high-90s."
        ),
    }


def build_osint_summary(waves: list[dict[str, Any]]) -> dict[str, Any]:
    weapon_counts: dict[str, int] = {}
    for wave in waves:
        for wt in wave["weaponTypes"]:
            weapon_counts[wt] = weapon_counts.get(wt, 0) + 1
    by_operation: dict[str, int] = {}
    for wave in waves:
        op = wave["operation"] or "unknown"
        by_operation[op] = by_operation.get(op, 0) + 1
    return {
        "totalWaves": len(waves),
        "usBaseTargetedWaves": sum(1 for w in waves if w.get("usBasesTargeted")),
        "israelTargetedWaves": sum(1 for w in waves if w.get("israelTargeted")),
        "byOperation": by_operation,
        "weaponTypeCounts": weapon_counts,
        "totalFatalities": sum(w["fatalities"] or 0 for w in waves),
        "totalInjuries": sum(w["injuries"] or 0 for w in waves),
        "interceptAnalytics": build_intercept_analytics(waves),
    }


def load_osint_waves(missiles: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    raw = fetch_osint_waves()
    incidents = raw.get("incidents") or raw.get("waves") or []
    waves = [normalize_osint_incident(i, missiles) for i in incidents]
    for wave in waves:
        wave["estimatedMunitions"] = _estimate_wave_munitions(wave)
    waves.sort(
        key=lambda w: (w.get("launchTimeUtc") or "", w.get("operation") or "", w.get("waveNumber") or 0),
        reverse=True,
    )
    summary = build_osint_summary(waves)
    return waves, summary


def fetch_osint_reference(name: str) -> list[dict[str, Any]] | dict[str, Any]:
    cache = ROOT / "data" / "osint" / name
    cache.parent.mkdir(parents=True, exist_ok=True)
    url = f"{OSINT_BASE}/reference/{name}"
    if not cache.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            cache.write_bytes(response.read())
    return json.loads(cache.read_text())


def _mercator_to_wgs84(x: float, y: float) -> tuple[float, float]:
    lon = x / 20037508.34 * 180.0
    lat = y / 20037508.34 * 180.0
    lat = 180.0 / math.pi * (2.0 * math.atan(math.exp(lat * math.pi / 180.0)) - math.pi / 2.0)
    return round(lat, 6), round(lon, 6)


def _isw_event_confidence(event_type: str | None) -> str:
    mapping = {
        "Confirmed Airstrike": "confirmed",
        "Reported Airstrike": "reported",
        "Report of Explosion with Footage": "partial",
        "Report of Explosion without Footage": "unverified",
        "Air Defense Activity": "ad_activity",
    }
    return mapping.get(event_type or "", "unknown")


ISW_EVENT_FIELD = "Event_Type__Confirmed_Airstrike__Reported_Airstrike__Report_of_E"
ISW_SITE_FIELD = "Site_Type__Nuclear__Military__Energy__etc__"


def fetch_isw_strikes(refresh: bool = False) -> list[dict[str, Any]]:
    """Fetch ISW/CTP coalition strike points from their public ArcGIS FeatureServer."""
    ISW_CACHE.parent.mkdir(parents=True, exist_ok=True)
    if ISW_CACHE.exists() and not refresh:
        cached = json.loads(ISW_CACHE.read_text())
        if isinstance(cached, list) and cached:
            return cached

    out_fields = (
        "OBJECTID,Post_Date,Publication_Date,Time,Actor,Targeted_Site,SIGACT,"
        f"{ISW_EVENT_FIELD},{ISW_SITE_FIELD},City,Province,Neighborhood_District"
    )
    params = {
        "where": "1=1",
        "outFields": out_fields,
        "returnGeometry": "true",
        "outSR": "4326",
        "orderByFields": "Post_Date DESC",
        "resultRecordCount": 2000,
        "f": "json",
    }
    url = ISW_STRIKES_URL + "?" + urllib.parse.urlencode(params)
    print(f"Fetching ISW strikes from ArcGIS FeatureServer ({ISW_STORY_URL})")
    with urllib.request.urlopen(url, timeout=120) as response:
        raw = json.loads(response.read())

    strikes: list[dict[str, Any]] = []
    for feature in raw.get("features") or []:
        attrs = feature.get("attributes") or {}
        geom = feature.get("geometry") or {}
        lat = geom.get("y")
        lon = geom.get("x")
        if lat is None or lon is None:
            x, y = geom.get("x"), geom.get("y")
            if x is not None and y is not None and abs(x) > 180:
                lat, lon = _mercator_to_wgs84(x, y)
        if lat is None or lon is None:
            continue

        post_ms = attrs.get("Post_Date")
        date_iso = None
        if post_ms:
            date_iso = datetime.fromtimestamp(post_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")

        event_type = attrs.get(ISW_EVENT_FIELD)
        city = attrs.get("City") or ""
        province = attrs.get("Province") or ""
        location = ", ".join(p for p in (city, province) if p)

        strikes.append(
            {
                "id": f"isw-{attrs.get('OBJECTID')}",
                "objectId": attrs.get("OBJECTID"),
                "date": date_iso,
                "timeLocal": attrs.get("Time"),
                "actor": attrs.get("Actor") or "Unknown",
                "targetSite": attrs.get("Targeted_Site"),
                "eventType": event_type,
                "confidence": _isw_event_confidence(event_type),
                "siteType": (attrs.get(ISW_SITE_FIELD) or "unknown").lower(),
                "city": city,
                "province": province,
                "neighborhood": attrs.get("Neighborhood_District"),
                "location": location or "Iran",
                "description": attrs.get("SIGACT"),
                "lat": lat,
                "lon": lon,
                "source": "ISW/CTP ArcGIS",
                "sourceUrl": ISW_STORY_URL,
            }
        )

    ISW_CACHE.write_text(json.dumps(strikes, indent=2))
    return strikes


def build_isw_summary(strikes: list[dict[str, Any]]) -> dict[str, Any]:
    by_event: dict[str, int] = {}
    by_site: dict[str, int] = {}
    for strike in strikes:
        et = strike.get("eventType") or "Unknown"
        by_event[et] = by_event.get(et, 0) + 1
        st = strike.get("siteType") or "unknown"
        by_site[st] = by_site.get(st, 0) + 1
    confirmed = by_event.get("Confirmed Airstrike", 0)
    return {
        "totalPoints": len(strikes),
        "confirmedStrikes": confirmed,
        "reportedStrikes": by_event.get("Reported Airstrike", 0),
        "explosionWithFootage": by_event.get("Report of Explosion with Footage", 0),
        "byEventType": by_event,
        "bySiteType": by_site,
        "dateRange": "Feb 28 – May 23, 2026 (ISW story map)",
        "sourceNote": (
            "Proprietary geodata from the Institute for the Study of War (ISW) and "
            "Critical Threats Project (CTP), published via ArcGIS StoryMaps. "
            "Green = confirmed airstrike, blue = reported, yellow = explosion w/ footage. "
            "Use for cross-reference — not redistributed as raw geodata."
        ),
        "storyMapUrl": ISW_STORY_URL,
    }


GM_WEAPON_ALIASES: dict[str, str] = {
    "gbu-31": "GBU-31 JDAM",
    "gbu-32": "GBU-32 JDAM",
    "gbu-38": "GBU-38 JDAM",
    "gbu-39": "GBU-39 SDB",
    "gbu-57": "GBU-57 MOP",
    "jdam": "GBU-31 JDAM",
    "sdb": "GBU-39 SDB",
    "mop": "GBU-57 MOP",
    "massive ordnance penetrator": "GBU-57 MOP",
    "bunker buster": "GBU-57 MOP",
    "bunker-buster": "GBU-57 MOP",
    "bunker-busting": "BLU-109",
    "blu-109": "BLU-109",
    "blu-118": "BLU-118",
    "mk 82": "Mk 82",
    "mk-82": "Mk 82",
    "mk 83": "Mk 83",
    "mk-83": "Mk 83",
    "mk 84": "Mk 84",
    "mk-84": "Mk 84",
    "paveway": "Paveway IV",
    "jsow": "AGM-154 JSOW",
    "jassm-er": "AGM-158B JASSM-ER",
    "jassm": "AGM-158 JASSM",
    "spice": "SPICE-2000",
    "delilah": "Delilah",
    "rampage": "Rampage",
    "harm": "AGM-88 HARM",
    "tomahawk": "BGM-109 TLAM Tomahawk",
    "slam-er": "AGM-84 SLAM-ER",
    "popeye": "AGM-142 Have Nap / Popeye",
}


def _match_weapon_aliases(reported: list[str], inventory: list[dict[str, Any]]) -> list[dict[str, str]]:
    by_name = {item["name"]: item for item in inventory}
    matches: list[dict[str, str]] = []
    seen: set[str] = set()
    for weapon in reported:
        needle = weapon.lower()
        matched_name: str | None = None
        for alias, canonical in GM_WEAPON_ALIASES.items():
            if alias in needle and canonical in by_name:
                matched_name = canonical
                break
        if not matched_name:
            for item in inventory:
                item_name = item["name"].lower()
                if item_name in needle or needle in item_name:
                    matched_name = item["name"]
                    break
        if matched_name and matched_name not in seen:
            entry = by_name[matched_name]
            matches.append({"reported": weapon, "name": entry["name"], "sourceUrl": entry["sourceUrl"]})
            seen.add(matched_name)
    return matches


def _summarize_aircraft(aircraft: dict[str, Any]) -> dict[str, Any]:
    armament = aircraft.get("armament") or {}
    return {
        "id": aircraft["id"],
        "systemName": aircraft["system_name"],
        "operator": aircraft.get("operator"),
        "type": aircraft.get("type"),
        "combatRadiusKm": aircraft.get("combat_radius_km"),
        "maxSpeedMach": aircraft.get("max_speed_mach"),
        "airToGround": armament.get("air_to_ground") or [],
        "roleInOperations": aircraft.get("role_in_operations"),
        "keyFeatures": aircraft.get("key_features") or [],
        "sourceUrl": (aircraft.get("sources") or [None])[0],
    }


def _match_aircraft(entry: dict[str, Any], aircraft_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {a["id"]: a for a in aircraft_list}
    matches: list[dict[str, Any]] = []
    seen: set[str] = set()

    for pid in entry.get("platformIds") or []:
        if pid in by_id and pid not in seen:
            matches.append(_summarize_aircraft(by_id[pid]))
            seen.add(pid)

    for platform in entry.get("platformsReported") or []:
        pl = platform.lower()
        for aircraft in aircraft_list:
            if aircraft["id"] in seen:
                continue
            names = [aircraft["system_name"], aircraft.get("nato_designation", "")]
            names.extend(aircraft.get("aliases") or [])
            if any(n and (n.lower() in pl or pl in n.lower()) for n in names):
                matches.append(_summarize_aircraft(aircraft))
                seen.add(aircraft["id"])
                break
    return matches


def load_coalition_strikes(
    missiles: list[dict[str, Any]], aircraft_list: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    raw = json.loads(COALITION_STRIKES_PATH.read_text())
    strikes: list[dict[str, Any]] = []
    for entry in raw:
        strikes.append(
            {
                **entry,
                "inventoryMatches": _match_weapon_aliases(entry.get("weaponsReported") or [], missiles),
                "aircraftMatches": _match_aircraft(entry, aircraft_list),
            }
        )
    strikes.sort(key=lambda s: s.get("date") or "", reverse=True)
    return strikes


def build_coalition_summary(
    strikes: list[dict[str, Any]], iran_wave_count: int, isw_strikes: list[dict[str, Any]]
) -> dict[str, Any]:
    executed = [s for s in strikes if s.get("confidence") != "threat"]
    us_involved = [s for s in strikes if "United States" in s.get("actor", "")]
    isw_confirmed = sum(1 for s in isw_strikes if s.get("confidence") == "confirmed")
    return {
        "totalRecords": len(strikes),
        "executedStrikes": len(executed),
        "usInvolvedStrikes": len(us_involved),
        "israelStrikes": len([s for s in strikes if "Israel" in s.get("actor", "")]),
        "iranAttackWaves": iran_wave_count,
        "ratioWavesToCoalition": round(iran_wave_count / max(len(executed), 1), 1),
        "iswStrikePoints": len(isw_strikes),
        "iswConfirmedStrikes": isw_confirmed,
        "dataGapNote": (
            "Iran attack waves are documented per-sortie in the OSINT repo (63 waves). "
            "Curated coalition seed has narrative campaign-level records; ISW/CTP ArcGIS "
            "adds ~1,180 geolocated US/Israel strike points (410 confirmed) for Feb–May 2026. "
            "DoD still does not publish per-sortie US ordnance manifests."
        ),
    }


def _estimate_wave_munitions(wave: dict[str, Any]) -> dict[str, Any]:
    parsed = _parse_payload_munitions(wave.get("payload"))
    explicit_count = wave.get("munitionsCount")
    classes = wave.get("threatClasses") or ["unknown"]

    if explicit_count:
        best = int(explicit_count)
        confidence = "reported"
        source = "OSINT estimated_munitions_count"
    elif parsed.get("total"):
        best = int(parsed["total"])
        confidence = "parsed"
        source = "payload text"
    else:
        best = sum(IMPUTE_BY_THREAT_CLASS.get(cls, 6) for cls in classes)
        confidence = "imputed"
        source = f"class imputation ({', '.join(classes)})"

    if confidence == "reported":
        low, high = max(1, round(best * 0.9)), round(best * 1.1)
    elif confidence == "parsed":
        low, high = max(1, round(best * 0.85)), round(best * 1.15)
    else:
        low, high = max(1, round(best * 0.6)), round(best * 1.6)

    return {
        "low": low,
        "high": high,
        "best": best,
        "confidence": confidence,
        "source": source,
        "parsed": {k: parsed[k] for k in ("drone", "cruise", "ballistic", "total") if parsed.get(k)},
    }


def _parse_narrative_strike_count(text: str | None) -> int | None:
    if not text:
        return None
    match = re.search(r"~?\s*(\d{2,4})\s+strikes", text.lower())
    if match:
        return int(match.group(1))
    return None


def build_munitions_estimates(
    waves: list[dict[str, Any]],
    conflict: list[dict[str, Any]],
    coalition_strikes: list[dict[str, Any]],
    isw_strikes: list[dict[str, Any]],
    missiles: list[dict[str, Any]],
) -> dict[str, Any]:
    by_operation: dict[str, dict[str, Any]] = {}
    by_threat: dict[str, dict[str, int]] = {}
    by_weapon_type: dict[str, dict[str, int]] = {}
    explicit_waves = parsed_waves = imputed_waves = 0
    iran_low = iran_high = iran_best = 0

    for wave in waves:
        est = wave.get("estimatedMunitions") or _estimate_wave_munitions(wave)
        op = wave.get("operation") or "unknown"
        op_bucket = by_operation.setdefault(
            op,
            {
                "operation": op,
                "label": wave.get("operationLabel") or op,
                "waves": 0,
                "low": 0,
                "high": 0,
                "best": 0,
                "explicitWaves": 0,
            },
        )
        op_bucket["waves"] += 1
        op_bucket["low"] += est["low"]
        op_bucket["high"] += est["high"]
        op_bucket["best"] += est["best"]
        if est["confidence"] == "reported":
            explicit_waves += 1
            op_bucket["explicitWaves"] += 1
        elif est["confidence"] == "parsed":
            parsed_waves += 1
        else:
            imputed_waves += 1

        iran_low += est["low"]
        iran_high += est["high"]
        iran_best += est["best"]

        parsed = est.get("parsed") or _parse_payload_munitions(wave.get("payload"))
        classes = wave.get("threatClasses") or ["unknown"]
        if parsed.get("total"):
            for cls in ("drone", "cruise", "ballistic"):
                if parsed.get(cls):
                    bucket = by_threat.setdefault(cls, {"low": 0, "high": 0, "best": 0})
                    share = parsed[cls] / parsed["total"]
                    bucket["low"] += round(est["low"] * share)
                    bucket["high"] += round(est["high"] * share)
                    bucket["best"] += round(est["best"] * share)
        elif est["confidence"] == "reported" and len(classes) == 1:
            bucket = by_threat.setdefault(classes[0], {"low": 0, "high": 0, "best": 0})
            bucket["low"] += est["low"]
            bucket["high"] += est["high"]
            bucket["best"] += est["best"]
        else:
            low_share = est["low"] / max(len(classes), 1)
            high_share = est["high"] / max(len(classes), 1)
            best_share = est["best"] / max(len(classes), 1)
            for cls in classes:
                bucket = by_threat.setdefault(cls, {"low": 0, "high": 0, "best": 0})
                bucket["low"] += round(low_share)
                bucket["high"] += round(high_share)
                bucket["best"] += round(best_share)

        weapon_types = wave.get("weaponTypes") or []
        if weapon_types:
            low_share = est["low"] / len(weapon_types)
            high_share = est["high"] / len(weapon_types)
            best_share = est["best"] / len(weapon_types)
            for wt in weapon_types:
                bucket = by_weapon_type.setdefault(
                    wt, {"waveAppearances": 0, "low": 0, "high": 0, "best": 0}
                )
                bucket["waveAppearances"] += 1
                bucket["low"] += round(low_share)
                bucket["high"] += round(high_share)
                bucket["best"] += round(best_share)

    kaggle_iran_events = sum(r["missileAttacks"] for r in conflict if r["country"] == "Iran")
    kaggle_israel_events = sum(r["missileAttacks"] for r in conflict if r["country"] == "Israel")

    isw_total = len(isw_strikes)
    isw_confirmed = sum(1 for s in isw_strikes if s.get("confidence") == "confirmed")
    coalition_anchors: list[dict[str, Any]] = []
    for strike in coalition_strikes:
        for field in ("description", "targets"):
            count = _parse_narrative_strike_count(strike.get(field))
            if count:
                coalition_anchors.append(
                    {
                        "label": strike.get("operation") or strike.get("id"),
                        "date": strike.get("dateLabel"),
                        "best": count,
                        "low": round(count * 0.85),
                        "high": round(count * 1.15),
                        "source": "Coalition strike narrative",
                    }
                )
                break

    isw_low = isw_confirmed + round((isw_total - isw_confirmed) * 0.75)
    isw_high = isw_confirmed * 3 + round((isw_total - isw_confirmed) * 2)
    isw_best = isw_confirmed * 2 + round((isw_total - isw_confirmed) * 1.25)
    coalition_anchors.append(
        {
            "label": "ISW geolocated strike points",
            "date": "Feb–May 2026",
            "best": isw_best,
            "low": isw_low,
            "high": isw_high,
            "source": f"ISW/CTP ({isw_confirmed} confirmed / {isw_total} total points × 1–3 munitions)",
        }
    )

    coalition_low = max(a["low"] for a in coalition_anchors)
    coalition_high = max(a["high"] for a in coalition_anchors)
    coalition_best = round(sum(a["best"] for a in coalition_anchors) / len(coalition_anchors))

    weapon_weights: dict[str, float] = {}
    inventory_urls = {m["name"]: m["sourceUrl"] for m in missiles}
    for strike in coalition_strikes:
        if strike.get("confidence") == "threat":
            continue
        strike_weight = {"reported": 1.0, "partial": 0.7}.get(strike.get("confidence", ""), 0.5)
        for match in strike.get("inventoryMatches") or []:
            name = match["name"]
            weapon_weights[name] = weapon_weights.get(name, 0) + strike_weight

    total_weight = sum(weapon_weights.values()) or 1.0
    coalition_by_weapon: list[dict[str, Any]] = []
    for name, weight in sorted(weapon_weights.items(), key=lambda item: item[1], reverse=True):
        share = weight / total_weight
        coalition_by_weapon.append(
            {
                "name": name,
                "inventoryName": name,
                "side": "coalition",
                "mentionWeight": round(weight, 2),
                "estimatedLow": max(1, round(coalition_low * share)),
                "estimatedHigh": max(1, round(coalition_high * share)),
                "estimatedBest": max(1, round(coalition_best * share)),
                "confidence": "allocated",
                "sourceUrl": inventory_urls.get(name, ""),
                "notes": "Share of coalition total from strike-card weapon mentions",
            }
        )

    iran_by_weapon: list[dict[str, Any]] = []
    for weapon_type, bucket in sorted(by_weapon_type.items(), key=lambda item: item[1]["best"], reverse=True):
        inventory_name = WEAPON_TYPE_TO_INVENTORY.get(weapon_type)
        iran_by_weapon.append(
            {
                "name": weapon_type,
                "inventoryName": inventory_name,
                "side": "iran",
                "waveAppearances": bucket["waveAppearances"],
                "estimatedLow": bucket["low"],
                "estimatedHigh": bucket["high"],
                "estimatedBest": bucket["best"],
                "confidence": "mixed",
                "sourceUrl": inventory_urls.get(inventory_name, "") if inventory_name else "",
                "notes": "Split across weapon types per wave when multiple reported",
            }
        )

    by_inventory: dict[str, dict[str, Any]] = {}
    for entry in iran_by_weapon + coalition_by_weapon:
        name = entry.get("inventoryName") or entry["name"]
        if not name:
            continue
        if name not in by_inventory:
            by_inventory[name] = {
                "name": name,
                "side": entry["side"],
                "estimatedLow": 0,
                "estimatedHigh": 0,
                "estimatedBest": 0,
                "confidence": entry["confidence"],
                "sourceUrl": entry.get("sourceUrl", inventory_urls.get(name, "")),
                "notes": [],
            }
        row = by_inventory[name]
        row["estimatedLow"] += entry["estimatedLow"]
        row["estimatedHigh"] += entry["estimatedHigh"]
        row["estimatedBest"] += entry["estimatedBest"]
        note = entry.get("notes")
        if note and note not in row["notes"]:
            row["notes"].append(note)

    by_inventory_system = sorted(by_inventory.values(), key=lambda item: item["estimatedBest"], reverse=True)

    return {
        "methodologyNote": (
            "Guestimates only — not official expenditure data. Iran totals combine explicit OSINT "
            "munition counts (16 waves), parsed payload strings, and per-threat-class imputation for "
            "waves without numbers. Coalition totals anchor on ISW geolocated strike points (1–3 "
            "munitions per point) and narrative strike counts (e.g. Epic Fury ~900). Per-system "
            "figures allocate those totals by weapon mentions on OSINT/coalition records. Kaggle "
            "'missile attacks' are daily event counts, not rounds fired — shown as a cross-check."
        ),
        "iran": {
            "totalLow": iran_low,
            "totalHigh": iran_high,
            "totalBest": iran_best,
            "explicitWaveCount": explicit_waves,
            "parsedWaveCount": parsed_waves,
            "imputedWaveCount": imputed_waves,
            "kaggleMissileAttackEvents": kaggle_iran_events,
            "byOperation": sorted(by_operation.values(), key=lambda item: item["best"], reverse=True),
            "byThreatClass": [
                {
                    "id": cls,
                    "label": THREAT_CLASS_LABELS.get(cls, cls),
                    **by_threat[cls],
                }
                for cls in ("drone", "cruise", "ballistic", "hypersonic", "unknown")
                if cls in by_threat
            ],
            "byWeaponType": iran_by_weapon,
        },
        "coalition": {
            "totalLow": coalition_low,
            "totalHigh": coalition_high,
            "totalBest": coalition_best,
            "anchors": coalition_anchors,
            "kaggleMissileAttackEvents": kaggle_israel_events,
            "byWeaponSystem": coalition_by_weapon,
        },
        "byInventorySystem": by_inventory_system,
    }


def enrich_missiles_with_estimates(
    missiles: list[dict[str, Any]], estimates: dict[str, Any]
) -> list[dict[str, Any]]:
    by_name = {row["name"]: row for row in estimates.get("byInventorySystem") or []}
    enriched: list[dict[str, Any]] = []
    for missile in missiles:
        row = by_name.get(missile["name"])
        if row:
            enriched.append(
                {
                    **missile,
                    "estimatedUse": {
                        "low": row["estimatedLow"],
                        "high": row["estimatedHigh"],
                        "best": row["estimatedBest"],
                        "confidence": row["confidence"],
                    },
                }
            )
        else:
            enriched.append(missile)
    return enriched


def build_geojson(
    map_data: dict[str, Any],
    coalition_strikes: list[dict[str, Any]],
    isw_strikes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    features: list[dict[str, Any]] = []

    for arc in map_data.get("arcs") or []:
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [arc["from"]["lon"], arc["from"]["lat"]],
                        [arc["to"]["lon"], arc["to"]["lat"]],
                    ],
                },
                "properties": {
                    "layer": "iran_attack_arc",
                    "id": arc["id"],
                    "operation": arc.get("operation"),
                    "waveNumber": arc.get("waveNumber"),
                    "usBasesTargeted": arc.get("usBasesTargeted"),
                    "payload": arc.get("payload"),
                    "stroke": "#3498db" if arc.get("usBasesTargeted") else "#c0392b",
                },
            }
        )

    for marker in map_data.get("markers") or []:
        props = {
            "layer": marker["type"],
            "id": marker["id"],
            "name": marker.get("name") or marker.get("label"),
            "label": marker.get("label"),
        }
        if marker.get("actor"):
            props["actor"] = marker["actor"]
        if marker.get("date"):
            props["date"] = marker["date"]
        if marker.get("weapons"):
            props["weapons"] = marker["weapons"]
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [marker["lon"], marker["lat"]],
                },
                "properties": props,
            }
        )

    for strike in coalition_strikes:
        if not strike.get("lat") or not strike.get("lon"):
            continue
        if any(f.get("properties", {}).get("id") == strike["id"] for f in features):
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [strike["lon"], strike["lat"]],
                },
                "properties": {
                    "layer": "coalition_strike",
                    "id": strike["id"],
                    "name": strike["operation"],
                    "actor": strike.get("actor"),
                    "date": strike.get("date"),
                    "confidence": strike.get("confidence"),
                    "weapons": strike.get("weaponsReported"),
                    "platforms": strike.get("platformsReported"),
                },
            }
        )

    for strike in isw_strikes or []:
        if strike.get("lat") is None or strike.get("lon") is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [strike["lon"], strike["lat"]],
                },
                "properties": {
                    "layer": "isw_strike",
                    "id": strike["id"],
                    "name": strike.get("targetSite"),
                    "date": strike.get("date"),
                    "confidence": strike.get("confidence"),
                    "eventType": strike.get("eventType"),
                    "siteType": strike.get("siteType"),
                    "description": (strike.get("description") or "")[:240],
                },
            }
        )

    layers = ["iran_attack_arc", "us_base", "israeli_target", "coalition_strike"]
    if isw_strikes:
        layers.append("isw_strike")

    return {
        "type": "FeatureCollection",
        "metadata": {
            "generated": str(date.today()),
            "featureCount": len(features),
            "layers": layers,
        },
        "features": features,
    }


def build_map_data(
    incidents: list[dict[str, Any]],
    us_bases: list[dict[str, Any]],
    israeli_targets: list[dict[str, Any]],
    coalition_strikes: list[dict[str, Any]],
    isw_strikes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    arcs: list[dict[str, Any]] = []
    markers: list[dict[str, Any]] = []

    for base in us_bases:
        if base.get("lat") and base.get("lon"):
            markers.append(
                {
                    "id": f"base-{base['name']}",
                    "type": "us_base",
                    "name": base["name"],
                    "lat": base["lat"],
                    "lon": base["lon"],
                    "label": f"{base['name']} ({base.get('country_code', '')})",
                }
            )

    for target in israeli_targets:
        if target.get("lat") and target.get("lon"):
            markers.append(
                {
                    "id": f"il-{target['name']}",
                    "type": "israeli_target",
                    "name": target["name"],
                    "lat": target["lat"],
                    "lon": target["lon"],
                    "label": target["name"],
                }
            )

    for strike in coalition_strikes:
        if strike.get("lat") and strike.get("lon"):
            markers.append(
                {
                    "id": strike["id"],
                    "type": "coalition_strike",
                    "name": strike["operation"],
                    "lat": strike["lat"],
                    "lon": strike["lon"],
                    "label": strike["operation"],
                    "actor": strike.get("actor"),
                    "date": strike.get("date"),
                    "weapons": strike.get("weaponsReported"),
                }
            )

    for strike in isw_strikes or []:
        if strike.get("lat") and strike.get("lon"):
            markers.append(
                {
                    "id": strike["id"],
                    "type": "isw_strike",
                    "name": strike.get("targetSite") or "ISW strike point",
                    "lat": strike["lat"],
                    "lon": strike["lon"],
                    "label": strike.get("targetSite") or strike.get("location") or "Strike",
                    "date": strike.get("date"),
                    "confidence": strike.get("confidence"),
                    "eventType": strike.get("eventType"),
                    "siteType": strike.get("siteType"),
                    "description": strike.get("description"),
                }
            )

    for incident in incidents:
        launch = incident.get("launch_site") or {}
        targets = incident.get("targets") or {}
        target_coords = targets.get("target_coordinates") or {}
        lat1, lon1 = launch.get("lat"), launch.get("lon")
        lat2, lon2 = target_coords.get("lat"), target_coords.get("lon")
        wave_id = f"{incident.get('operation')}-{incident.get('wave_number')}"
        if lat1 and lon1 and lat2 and lon2:
            arc_type = "us_targeted" if targets.get("us_bases_targeted") else "israel_targeted"
            arcs.append(
                {
                    "id": wave_id,
                    "type": arc_type,
                    "operation": incident.get("operation"),
                    "waveNumber": incident.get("wave_number"),
                    "from": {"lat": lat1, "lon": lon1},
                    "to": {"lat": lat2, "lon": lon2},
                    "usBasesTargeted": bool(targets.get("us_bases_targeted")),
                    "launchTimeUtc": (incident.get("timing") or {}).get("probable_launch_time")
                    or (incident.get("timing") or {}).get("announced_utc"),
                    "payload": (incident.get("weapons") or {}).get("payload"),
                }
            )

    return {"markers": markers, "arcs": arcs, "arcCount": len(arcs), "markerCount": len(markers)}


def _iso_sort_key(iso: str | None, fallback: int = 0) -> str:
    return iso or f"9999-12-31-{fallback:04d}"


def build_infographic_events(
    timeline: list[dict[str, Any]],
    waves: list[dict[str, Any]],
    coalition_strikes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for item in timeline:
        events.append(
            {
                "id": f"tl-{item['id']}",
                "kind": "narrative",
                "sortKey": str(item.get("sortKey", item["year"] * 10000)).zfill(12),
                "dateLabel": item["date"],
                "year": item["year"],
                "title": item["event"],
                "subtitle": item["category"],
                "lane": 2,
                "isUsStrike": item.get("isUsStrike"),
            }
        )

    for wave in waves:
        if not wave.get("launchTimeUtc"):
            continue
        events.append(
            {
                "id": wave["id"],
                "kind": "iran_wave",
                "sortKey": wave["launchTimeUtc"],
                "dateLabel": (wave["launchTimeUtc"] or "")[:10],
                "year": int((wave["launchTimeUtc"] or "2026")[:4]),
                "title": f"{wave['operationLabel']} — Wave {wave['waveNumber']}",
                "subtitle": ", ".join(wave["weaponTypes"][:3]) or wave.get("payload") or "Attack wave",
                "lane": 0,
                "usTargeted": wave.get("usBasesTargeted"),
            }
        )

    for strike in coalition_strikes:
        events.append(
            {
                "id": strike["id"],
                "kind": "coalition_strike",
                "sortKey": strike["date"],
                "dateLabel": strike.get("dateLabel") or strike["date"],
                "year": int(strike["date"][:4]),
                "title": strike["operation"],
                "subtitle": strike.get("actor", ""),
                "lane": 1,
                "weapons": strike.get("weaponsReported"),
                "confidence": strike.get("confidence"),
            }
        )

    events.sort(key=lambda e: (e["sortKey"], e["id"]), reverse=True)
    return events


def parse_range_km(value: str) -> float | None:
    if not value or value.strip() in {"—", "-", "N/A"}:
        return None
    match = re.search(r"([\d,]+(?:\.\d+)?)", value.replace(",", ""))
    return float(match.group(1)) if match else None


def parse_speed_mach(value: str) -> float | None:
    if not value or value.strip() in {"—", "-", "N/A"}:
        return None
    match = re.search(r"Mach\s*([\d.]+)", value, re.I)
    if match:
        return float(match.group(1))
    kmh = re.search(r"([\d,]+)\s*km/h", value.replace(",", ""), re.I)
    if kmh:
        return round(float(kmh.group(1)) / 1225, 2)
    return None


def load_missiles() -> list[dict[str, Any]]:
    raw_missiles = json.loads(SEED_PATH.read_text())
    raw_bombs = json.loads(BOMBS_SEED_PATH.read_text()) if BOMBS_SEED_PATH.exists() else []
    by_name: dict[str, dict[str, Any]] = {}
    for entry in raw_missiles + raw_bombs:
        by_name[entry["name"]] = entry
    missiles: list[dict[str, Any]] = []
    for entry in by_name.values():
        source_url = entry.get("sourceUrl", "")
        missiles.append(
            {
                "name": entry["name"],
                "countries": entry["countries"],
                "category": entry["category"],
                "rangeKm": parse_range_km(entry.get("rangeText", "")),
                "rangeText": entry.get("rangeText", ""),
                "maxSpeedMach": parse_speed_mach(entry.get("maxSpeedText", "")),
                "maxSpeedText": entry.get("maxSpeedText", ""),
                "sourceUrl": source_url,
                "sourceSite": "GlobalMilitary.net",
                "inventoryKind": "bomb" if "/bombs/" in source_url else "missile",
            }
        )
    return missiles


def extract_conflict_from_notebook(notebook_path: Path) -> list[dict[str, Any]]:
    nb = json.loads(notebook_path.read_text())
    for cell in nb.get("cells", []):
        src = "".join(cell.get("source", []))
        if "Missile_Attacks" in src and "data = {" in src:
            start = src.index("data = {")
            end = src.index("\n}", start) + 2
            data = ast.literal_eval(src[start + len("data = ") : end])
            records = []
            row_count = len(data["Country"])
            for i in range(row_count):
                drone = data["Drone_Attacks"][i]
                injuries = data["Injuries"][i]
                records.append(
                    {
                        "country": data["Country"][i],
                        "date": data["Date"][i][:10],
                        "missileAttacks": int(data["Missile_Attacks"][i]),
                        "droneAttacks": None if drone is None else int(drone),
                        "deaths": int(data["Deaths"][i]),
                        "injuries": None if injuries is None else int(injuries),
                        "civilianDeaths": int(data["Civilian_Deaths"][i]),
                        "militaryDeaths": int(data["Military_Deaths"][i]),
                        "infrastructureDamage": int(data["Infrastructure_Damage"][i]),
                    }
                )
            return records
    raise RuntimeError("Could not find conflict data cell in Kaggle notebook")


def ensure_kaggle_notebook() -> Path:
    notebook = ROOT / "data" / "kaggle" / "iran-israel-conflict-dataset.ipynb"
    if notebook.exists():
        return notebook
    zip_path = ROOT / "data" / "kaggle.zip"
    if not zip_path.exists():
        print(
            "Missing Kaggle data. Download with:\n"
            '  export KAGGLE_API_TOKEN="your-token"\n'
            '  curl -sL -H "Authorization: Bearer $KAGGLE_API_TOKEN" '
            '"https://www.kaggle.com/api/v1/datasets/download/misbahfakhar/iran-israel-conflict" '
            "-o data/kaggle.zip",
            file=sys.stderr,
        )
        sys.exit(1)
    notebook.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(notebook.parent)
    return notebook


def build_cross_reference(
    conflict: list[dict[str, Any]], missiles: list[dict[str, Any]]
) -> dict[str, Any]:
    by_country: dict[str, list[dict[str, Any]]] = {c: [] for c in CONFLICT_COUNTRIES}
    for missile in missiles:
        for country in missile["countries"]:
            if country in by_country:
                by_country[country].append(missile)

    conflict_totals: dict[str, dict[str, float | int]] = {}
    for country in CONFLICT_COUNTRIES:
        rows = [r for r in conflict if r["country"] == country]
        conflict_totals[country] = {
            "missileAttacks": sum(r["missileAttacks"] for r in rows),
            "droneAttacks": sum(r["droneAttacks"] or 0 for r in rows),
            "deaths": sum(r["deaths"] for r in rows),
            "injuries": sum(r["injuries"] or 0 for r in rows),
        }

    category_summary: list[dict[str, Any]] = []
    for category in ("Ballistic", "Cruise", "Air-to-Surface"):
        for country in CONFLICT_COUNTRIES:
            inventory = [m for m in by_country[country] if m["category"] == category]
            ranges = [m["rangeKm"] for m in inventory if m["rangeKm"] is not None]
            category_summary.append(
                {
                    "country": country,
                    "category": category,
                    "inventoryCount": len(inventory),
                    "maxRangeKm": max(ranges) if ranges else None,
                    "avgRangeKm": round(sum(ranges) / len(ranges), 1) if ranges else None,
                    "reportedMissileAttacks": conflict_totals[country]["missileAttacks"],
                    "systems": [m["name"] for m in inventory],
                }
            )

    return {
        "inventoryByCountry": by_country,
        "conflictTotals": conflict_totals,
        "categorySummary": category_summary,
    }


def build_current_status() -> dict[str, Any]:
    """Curated snapshot of the post-MOU diplomatic and military situation."""
    today = date.today()
    return {
        "asOf": str(today),
        "headline": "Fragile ceasefire under Islamabad Memorandum",
        "summary": (
            "The Feb–Mar 2026 hot war has shifted to a negotiated pause. The Islamabad "
            "Memorandum (signed June 17–18) established a 60-day roadmap, Hormuz reopening "
            "commitments, and Lebanon de-confliction — but tit-for-tat incidents and Doha "
            "technical talks show implementation remains contested."
        ),
        "phase": "Diplomacy & implementation",
        "indicators": [
            {
                "label": "Ceasefire framework",
                "value": "Islamabad MOU (14 points)",
                "tone": "caution",
            },
            {
                "label": "MOU signed",
                "value": "June 17–18, 2026",
                "tone": "neutral",
            },
            {
                "label": "Final deal window",
                "value": "60 days (extendable)",
                "tone": "neutral",
            },
            {
                "label": "Strait of Hormuz",
                "value": "Reopening pledged; incidents continue",
                "tone": "caution",
            },
            {
                "label": "Lebanon front",
                "value": "De-confliction cell; IDF–Hezbollah clashes",
                "tone": "caution",
            },
            {
                "label": "Latest diplomacy",
                "value": "Doha talks (Jul 1–3); paused for funeral",
                "tone": "neutral",
            },
        ],
        "watchItems": [
            "US–Iran hotline for MOU violation reporting (established post-Doha)",
            "Khamenei funeral processions (Jul 4–9) — diplomacy on hold",
            "Iran warnings of proportionate response if MOU breached",
            "Israel–Hezbollah fighting in southern Lebanon despite MOU Lebanon clause",
            "Post-MOU strikes: US bases in Kuwait/Bahrain; US retaliatory Gulf strikes",
        ],
        "sources": [
            {
                "label": "ISW Iran Update (Jul 3, 2026)",
                "url": "https://understandingwar.org/research/middle-east/iran-update-special-report-july-3-2026/",
            },
            {
                "label": "Al Jazeera — Doha talks",
                "url": "https://www.aljazeera.com/news/2026/7/2/us-iran-talks-in-doha-what-were-the-outcomes-and-whats-next",
            },
            {
                "label": "CNN — Islamabad MOU text",
                "url": "https://www.cnn.com/2026/06/17/middleeast/us-iran-war-mou-text-intl",
            },
            {
                "label": "BBC — MOU full text",
                "url": "https://www.bbc.co.uk/news/articles/c4gy700j0eko",
            },
        ],
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    missiles = load_missiles()
    conflict = extract_conflict_from_notebook(ensure_kaggle_notebook())
    timeline_raw = load_timeline_events()
    timeline = link_timeline_to_conflict(timeline_raw, conflict)
    timeline_stats = build_timeline_stats(timeline_raw)
    cross_ref = build_cross_reference(conflict, missiles)
    raw_osint = fetch_osint_waves()
    incidents = raw_osint.get("incidents") or raw_osint.get("waves") or []
    osint_waves, osint_summary = load_osint_waves(missiles)
    coalition_aircraft = fetch_osint_reference("coalition_aircraft.json")
    coalition_strikes = load_coalition_strikes(missiles, coalition_aircraft)
    isw_strikes = fetch_isw_strikes()
    isw_summary = build_isw_summary(isw_strikes)
    coalition_summary = build_coalition_summary(coalition_strikes, len(osint_waves), isw_strikes)
    us_bases = fetch_osint_reference("us_bases.json")
    israeli_targets_path = ROOT / "data" / "osint" / "israeli_targets.json"
    if not israeli_targets_path.exists():
        url = f"{OSINT_BASE}/tp4-2026/reference/israeli_targets.json"
        with urllib.request.urlopen(url, timeout=60) as response:
            israeli_targets_path.write_bytes(response.read())
    israeli_targets = json.loads(israeli_targets_path.read_text())
    map_data = build_map_data(incidents, us_bases, israeli_targets, coalition_strikes, isw_strikes)
    geojson = build_geojson(map_data, coalition_strikes, isw_strikes)
    geojson_path = OUT_DIR / "conflict.geojson"
    geojson_path.write_text(json.dumps(geojson, indent=2))
    infographic_events = build_infographic_events(timeline_raw, osint_waves, coalition_strikes)
    munitions_estimates = build_munitions_estimates(
        osint_waves, conflict, coalition_strikes, isw_strikes, missiles
    )
    missiles = enrich_missiles_with_estimates(missiles, munitions_estimates)

    payload = {
        "meta": {
            "conflictSource": "Kaggle — misbahfakhar/iran-israel-conflict",
            "timelineSource": "Kaggle — muhammadshayan5839/iran-usa-conflict-2023-2026",
            "osintSource": "GitHub — danielrosehill/Iran-Israel-War-2026-OSINT-Data",
            "coalitionStrikesSource": "Curated OSINT seed + ISW/CTP ArcGIS FeatureServer",
            "iswSource": "ISW/CTP — Interactive Map: U.S. and Israeli Strikes in Iran (2026)",
            "iswStoryMapUrl": ISW_STORY_URL,
            "geojsonPath": "/data/conflict.geojson",
            "missileSource": "GlobalMilitary.net missiles + bombs",
            "bombCatalogUrl": "https://www.globalmilitary.net/bombs/",
            "missileSeedDate": str(date.today()),
            "categories": sorted({m["category"] for m in missiles}),
        },
        "conflict": conflict,
        "timeline": timeline,
        "timelineStats": timeline_stats,
        "osintWaves": osint_waves,
        "osintSummary": osint_summary,
        "coalitionStrikes": coalition_strikes,
        "coalitionSummary": coalition_summary,
        "iswStrikes": isw_strikes,
        "iswSummary": isw_summary,
        "coalitionAircraft": coalition_aircraft,
        "mapData": map_data,
        "geojson": geojson,
        "infographicEvents": infographic_events,
        "munitionsEstimates": munitions_estimates,
        "missiles": missiles,
        "crossReference": cross_ref,
        "currentStatus": build_current_status(),
    }

    out_path = OUT_DIR / "dashboard.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(
        f"Wrote {out_path} ({len(osint_waves)} Iran waves, {len(coalition_strikes)} coalition records, "
        f"{len(isw_strikes)} ISW points, {geojson['metadata']['featureCount']} GeoJSON features)"
    )
    print(f"Wrote {geojson_path}")


if __name__ == "__main__":
    main()
