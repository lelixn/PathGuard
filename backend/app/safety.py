
from math import isnan
from typing import Any


def _normalize(value: Any) -> list[str]:
    """Normalize OSM attributes that may be strings, lists, or missing."""
    if value is None:
        return []

    if isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = [value]

    return [
        normalized
        for item in values
        if item is not None
        and not _is_nan(item)
        and (normalized := str(item).strip().lower())
    ]


def _is_nan(value: Any) -> bool:
    try:
        return isnan(value)
    except (TypeError, ValueError):
        return False


def score_street(attributes: dict[str, Any]) -> dict[str, Any]:
    """
    Estimate street suitability from mapped OSM attributes.

    This is a heuristic, not a validated crime or personal-safety model.
    Missing attributes are reported as unknown.
    """
    score = 60
    reasons: list[str] = []
    known_signals = 0

    highway_values = _normalize(attributes.get("highway"))
    highway = highway_values[0] if highway_values else ""

    foot_values = _normalize(attributes.get("foot"))
    sidewalk_values = _normalize(attributes.get("sidewalk"))
    lit_values = _normalize(attributes.get("lit"))
    maxspeed_values = _normalize(attributes.get("maxspeed"))

    # Road type: a proxy for pedestrian suitability, not crime risk.
    pedestrian_friendly = {
        "pedestrian",
        "footway",
        "path",
        "living_street",
        "steps",
        "track",
    }
    vehicle_oriented = {
        "motorway",
        "motorway_link",
        "trunk",
        "trunk_link",
    }

    if highway:
        known_signals += 1
        if highway in pedestrian_friendly:
            score += 15
            reasons.append("Mapped as a pedestrian-oriented path or street")
        elif highway in vehicle_oriented:
            score -= 25
            reasons.append("Mapped road type is primarily vehicle-oriented")
        else:
            reasons.append(f"Mapped road type: {highway}")

    # Explicit pedestrian access.
    if foot_values:
        known_signals += 1
        if any(value in {"no", "private"} for value in foot_values):
            score -= 25
            reasons.append("Mapped pedestrian access is restricted")
        elif any(value in {"yes", "designated", "permissive"} for value in foot_values):
            score += 5
            reasons.append("Mapped pedestrian access is permitted")

    # Sidewalk data is useful, but absence does not prove there is no sidewalk.
    if sidewalk_values:
        known_signals += 1
        if any(value in {"both", "left", "right", "yes", "separate"} for value in sidewalk_values):
            score += 10
            reasons.append("Sidewalk infrastructure is mapped")
        elif any(value in {"no", "none"} for value in sidewalk_values):
            score -= 10
            reasons.append("OSM explicitly indicates no sidewalk")

    # Lighting is an attribute, not evidence of actual nighttime conditions.
    if lit_values:
        known_signals += 1
        if any(value in {"yes", "automatic"} for value in lit_values):
            score += 10
            reasons.append("Street lighting is mapped")
        elif any(value == "no" for value in lit_values):
            score -= 10
            reasons.append("OSM explicitly indicates no street lighting")

    # Posted speed is only a rough proxy; it is not a direct measurement
    # of traffic volume or driver behavior.
    if maxspeed_values:
        known_speed = None
        for value in maxspeed_values:
            digits = "".join(ch for ch in value if ch.isdigit())
            if digits:
                known_speed = int(digits)
                break

        if known_speed is not None:
            known_signals += 1
            if known_speed <= 30:
                score += 5
                reasons.append(f"Mapped speed limit: {known_speed}")
            elif known_speed >= 60:
                score -= 10
                reasons.append(f"Mapped high speed limit: {known_speed}")
            else:
                reasons.append(f"Mapped speed limit: {known_speed}")

    score = max(0, min(100, score))

    if score >= 70:
        risk_level = "lower_estimated"
    elif score >= 40:
        risk_level = "moderate_estimated"
    else:
        risk_level = "higher_estimated"

    return {
        "safety_score": score,
        "risk_level": risk_level,
        "known_signals": known_signals,
        "data_completeness": (
            "some_mapped_attributes"
            if known_signals
            else "insufficient_data"
        ),
        "reasons": reasons or [
            "Insufficient mapped attributes for a meaningful assessment"
        ],
        "model": "osm_heuristic_v1",
        "validated_safety_data": False,
    }
