import pathlib
from typing import Union

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

DATA_PATH = pathlib.Path(__file__).resolve().parent.parent / "data" / "iran-israel-conflict.csv"

COUNTRY_COLORS = {
    "Iran": "#c0392b",
    "Israel": "#2980b9",
}

METRIC_LABELS = {
    "Missile_Attacks": "Missile attacks",
    "Drone_Attacks": "Drone attacks",
    "Deaths": "Deaths",
    "Injuries": "Injuries",
    "Civilian_Deaths": "Civilian deaths",
    "Military_Deaths": "Military deaths",
    "Infrastructure_Damage": "Infrastructure damage",
}


@st.cache_data
def load_data() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, parse_dates=["Date"])
    return df.sort_values(["Date", "Country"]).reset_index(drop=True)


def format_number(value: Union[float, int, None]) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "—"
    if float(value).is_integer():
        return f"{int(value):,}"
    return f"{value:,.1f}"


def metric_total(df: pd.DataFrame, column: str) -> float:
    return float(df[column].sum(skipna=True))


def apply_custom_style() -> None:
    st.markdown(
        """
        <style>
        .block-container {
            padding-top: 2rem;
            padding-bottom: 2rem;
            max-width: 1200px;
        }
        [data-testid="stMetricValue"] {
            font-size: 1.75rem;
        }
        .dashboard-title {
            font-size: 2.1rem;
            font-weight: 700;
            margin-bottom: 0.25rem;
        }
        .dashboard-subtitle {
            color: rgba(250, 250, 250, 0.72);
            margin-bottom: 1.5rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_kpis(filtered: pd.DataFrame) -> None:
    cols = st.columns(5)
    metrics = [
        ("Missile_Attacks", "Missile attacks"),
        ("Drone_Attacks", "Drone attacks"),
        ("Deaths", "Total deaths"),
        ("Injuries", "Injuries"),
        ("Infrastructure_Damage", "Infra. damage"),
    ]
    for col, (field, label) in zip(cols, metrics):
        col.metric(label, format_number(metric_total(filtered, field)))


def trend_chart(filtered: pd.DataFrame) -> None:
    melted = filtered.melt(
        id_vars=["Date", "Country"],
        value_vars=["Missile_Attacks", "Drone_Attacks"],
        var_name="Attack type",
        value_name="Count",
    )
    melted["Attack type"] = melted["Attack type"].map(METRIC_LABELS)

    fig = px.line(
        melted,
        x="Date",
        y="Count",
        color="Country",
        line_dash="Attack type",
        markers=True,
        color_discrete_map=COUNTRY_COLORS,
        title="Attack volume over time",
    )
    fig.update_layout(
        legend_title_text="",
        hovermode="x unified",
        margin=dict(l=0, r=0, t=48, b=0),
        height=380,
    )
    st.plotly_chart(fig, use_container_width=True)


def casualty_chart(filtered: pd.DataFrame) -> None:
    totals = (
        filtered.groupby("Country")[["Civilian_Deaths", "Military_Deaths", "Injuries"]]
        .sum(min_count=1)
        .reset_index()
    )
    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            name="Civilian deaths",
            x=totals["Country"],
            y=totals["Civilian_Deaths"],
            marker_color="#e67e22",
        )
    )
    fig.add_trace(
        go.Bar(
            name="Military deaths",
            x=totals["Country"],
            y=totals["Military_Deaths"],
            marker_color="#8e44ad",
        )
    )
    fig.add_trace(
        go.Bar(
            name="Injuries",
            x=totals["Country"],
            y=totals["Injuries"],
            marker_color="#16a085",
        )
    )
    fig.update_layout(
        barmode="group",
        title="Casualties and injuries by country",
        margin=dict(l=0, r=0, t=48, b=0),
        height=380,
        legend_title_text="",
    )
    st.plotly_chart(fig, use_container_width=True)


def scatter_chart(filtered: pd.DataFrame) -> None:
    fig = px.scatter(
        filtered,
        x="Missile_Attacks",
        y="Deaths",
        color="Country",
        size="Infrastructure_Damage",
        hover_data=["Date", "Drone_Attacks", "Injuries"],
        color_discrete_map=COUNTRY_COLORS,
        title="Missile attacks vs deaths (bubble size = infrastructure damage)",
    )
    fig.update_layout(margin=dict(l=0, r=0, t=48, b=0), height=380)
    st.plotly_chart(fig, use_container_width=True)


def correlation_chart(filtered: pd.DataFrame) -> None:
    numeric = filtered.select_dtypes(include="number")
    if numeric.shape[1] < 2:
        st.info("Not enough numeric columns for a correlation view.")
        return

    corr = numeric.corr(numeric_only=True)
    labels = [METRIC_LABELS.get(col, col) for col in corr.columns]
    fig = px.imshow(
        corr,
        text_auto=".2f",
        x=labels,
        y=labels,
        color_continuous_scale="RdBu_r",
        zmin=-1,
        zmax=1,
        title="Metric correlations",
    )
    fig.update_layout(margin=dict(l=0, r=0, t=48, b=0), height=420)
    st.plotly_chart(fig, use_container_width=True)


def main() -> None:
    st.set_page_config(
        page_title="Iran–Israel Conflict Dashboard",
        page_icon="📊",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    apply_custom_style()

    df = load_data()

    st.markdown('<p class="dashboard-title">Iran–Israel Conflict Dashboard</p>', unsafe_allow_html=True)
    st.markdown(
        '<p class="dashboard-subtitle">Missile strikes and casualty statistics (Feb–Mar 2026) · '
        'Source: <a href="https://www.kaggle.com/datasets/misbahfakhar/iran-israel-conflict" '
        'target="_blank">Kaggle — misbahfakhar/iran-israel-conflict</a></p>',
        unsafe_allow_html=True,
    )

    with st.sidebar:
        st.header("Filters")
        countries = st.multiselect(
            "Countries",
            options=sorted(df["Country"].unique()),
            default=sorted(df["Country"].unique()),
        )
        min_date = df["Date"].min().date()
        max_date = df["Date"].max().date()
        date_range = st.date_input(
            "Date range",
            value=(min_date, max_date),
            min_value=min_date,
            max_value=max_date,
        )
        st.divider()
        st.caption(
            "Dataset covers four reporting dates with per-country attack counts, "
            "casualty breakdowns, and infrastructure damage scores."
        )

    if len(date_range) == 2:
        start_date, end_date = date_range
    else:
        start_date = end_date = date_range[0]

    filtered = df[
        df["Country"].isin(countries)
        & (df["Date"].dt.date >= start_date)
        & (df["Date"].dt.date <= end_date)
    ].copy()

    if filtered.empty:
        st.warning("No rows match the current filters.")
        return

    render_kpis(filtered)

    left, right = st.columns(2)
    with left:
        trend_chart(filtered)
    with right:
        casualty_chart(filtered)

    left, right = st.columns(2)
    with left:
        scatter_chart(filtered)
    with right:
        correlation_chart(filtered)

    st.subheader("Raw data")
    display = filtered.copy()
    display["Date"] = display["Date"].dt.strftime("%Y-%m-%d")
    display = display.rename(columns=METRIC_LABELS)
    st.dataframe(display, use_container_width=True, hide_index=True)

    missing = filtered.isna().sum()
    missing = missing[missing > 0]
    if not missing.empty:
        st.caption(
            "Missing values in filtered data: "
            + ", ".join(f"{METRIC_LABELS.get(col, col)} ({count})" for col, count in missing.items())
        )


if __name__ == "__main__":
    main()
