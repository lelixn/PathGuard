
from typing import Any


def _values(value: Any) -> set[str]:
    if value is None:
        return set()

    if not isinstance(value, (list, tuple, set)):
        value = [value]

    return {
        str(item).strip().lower()
        for item in value
        if item is not None and str(item).strip()
    }


def score_street(attributes: dict[str, Any]) -> dict[str, Any]:
    """
    Estimate pedestrian-route suitability from OSM attributes.

    This is a transparent heuristic, not a validated personal-safety
    or crime-risk model.
    """
    score = 60
    reasons: list[str] = []
    known_signals = 0

    highway = _values(attributes.get("highway"))
    foot = _values(attributes.get("foot"))
    sidewalk = _values(attributes.get("sidewalk"))
    lit = _values(attributes.get("lit"))
    maxspeed = _values(attributes.get("maxspeed"))

    # Road classification is a proxy for pedestrian suitability only.
    if highway:
        known_signals += 1

        if highway.intersection({
            "footway", "pedestrian", "path", "living_street"
        }):
            score += 15
            reasons.append("Mapped as pedestrian-oriented infrastructure")

        elif highway.intersection({
            "motorway", "motorway_link", "trunk", "trunk_link"
        }):
            score -= 25
            reasons.append("Mapped road class is primarily vehicle-oriented")

        elif highway.intersection({
            "primary", "primary_link"
        }):
            score -= 8
            reasons.append("Mapped as a primary road")

        elif highway.intersection({
            "secondary", "secondary_link"
        }):
            score -= 4
            reasons.append("Mapped as a secondary road")

        elif highway.intersection({
            "residential", "living_street"
        }):
            score += 5
            reasons.append("Mapped residential or low-speed street")

        else:
            reasons.append("Road class is mapped")

    if foot:
        known_signals += 1

        if foot.intersection({"no", "private"}):
            score -= 30
            reasons.append("Pedestrian access is restricted")

        elif foot.intersection({"yes", "designated", "permissive"}):
            score += 5
            reasons.append("Pedestrian access is explicitly permitted")

    if sidewalk:
        known_signals += 1

        if sidewalk.intersection({
            "both", "left", "right", "yes", "separate"
        }):
            score += 10
            reasons.append("Sidewalk infrastructure is mapped")

        elif sidewalk.intersection({"no", "none"}):
            score -= 12
            reasons.append("OSM explicitly indicates no sidewalk")

    if lit:
        known_signals += 1

        if lit.intersection({"yes", "automatic"}):
            score += 8
            reasons.append("Street lighting is mapped")

        elif "no" in lit:
            score -= 8
            reasons.append("OSM explicitly indicates no street lighting")

    if maxspeed:
        parsed_speeds = []

        for value in maxspeed:
            digits = "".join(character for character in value if character.isdigit())
            if digits:
                parsed_speeds.append(int(digits))

        if parsed_speeds:
            known_signals += 1
            speed = min(parsed_speeds)

            if speed <= 30:
                score += 5
                reasons.append(f"Mapped speed limit: {speed}")

            elif speed >= 60:
                score -= 10
                reasons.append(f"Mapped high speed limit: {speed}")

            else:
                reasons.append(f"Mapped speed limit: {speed}")

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
            if known_signals > 0
            else "insufficient_data"
        ),
        "reasons": reasons or [
            "Insufficient mapped attributes for assessment"
        ],
        "model": "osm_heuristic_v2",
        "validated_safety_data": False,
    }
