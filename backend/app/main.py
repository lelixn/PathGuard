from __future__ import annotations

import math

from shapely.geometry import LineString, mapping
from app.safety import score_street

import hashlib
import logging
import math
import os
import threading
from pathlib import Path
from typing import Any

import networkx as nx
import osmnx as ox
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.safety import score_street

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
GRAPH_DIR = BASE_DIR / "data" / "graphs"
GRAPH_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pathguard")

ox.settings.log_console = False
ox.settings.use_cache = True

app = FastAPI(
    title="PATHGUARD API",
    description="Pedestrian network intelligence and routing API",
    version="0.3.0",
)

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Supported city network centers
# These coordinates define the initial study areas.
# ---------------------------------------------------------

CITIES: dict[str, dict[str, Any]] = {
    "bhubaneswar": {
        "name": "Bhubaneswar",
        "state": "Odisha",
        "latitude": 20.2961,
        "longitude": 85.8245,
        "radius_m": 2500,
    },
    "delhi": {
        "name": "Delhi",
        "state": "Delhi",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "radius_m": 2500,
    },
    "mumbai": {
        "name": "Mumbai",
        "state": "Maharashtra",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "radius_m": 2500,
    },
    "bengaluru": {
        "name": "Bengaluru",
        "state": "Karnataka",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "radius_m": 2500,
    },
    "hyderabad": {
        "name": "Hyderabad",
        "state": "Telangana",
        "latitude": 17.3850,
        "longitude": 78.4867,
        "radius_m": 2500,
    },
    "chennai": {
        "name": "Chennai",
        "state": "Tamil Nadu",
        "latitude": 13.0827,
        "longitude": 80.2707,
        "radius_m": 2500,
    },
}

NETWORK_TYPE = "walk"

# Protects graph creation and cache access from duplicate
# simultaneous builds within this Python process.
graph_lock = threading.Lock()


def normalize_city(city: str) -> str:
    key = city.strip().lower()

    if key not in CITIES:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Unsupported city.",
                "supported_cities": list(CITIES.keys()),
            },
        )

    return key


def graph_cache_path(city_key: str) -> Path:
    city = CITIES[city_key]
    identity = (
        f"{city_key}:{city['latitude']}:{city['longitude']}:"
        f"{city['radius_m']}:{NETWORK_TYPE}:v1"
    )
    digest = hashlib.sha256(identity.encode()).hexdigest()[:12]
    return GRAPH_DIR / f"{city_key}_{digest}.graphml"


def clean_missing_attribute(value: Any) -> Any:
    if value is None:
        return None

    try:
        if math.isnan(value):
            return None
    except (TypeError, ValueError):
        pass

    return value


def load_or_build_graph(city_key: str) -> nx.MultiDiGraph:
    """
    Return a cached pedestrian graph, or download and cache one.

    The initial study area is a 2.5 km radius around each
    configured city center, not the entire metropolitan area.
    """
    path = graph_cache_path(city_key)

    with graph_lock:
        if path.exists():
            logger.info("Loading cached graph for %s", city_key)
            try:
                graph = ox.load_graphml(path)
                if len(graph) > 0 and graph.number_of_edges() > 0:
                    return graph
                logger.warning("Cached graph is empty; rebuilding it.")
            except Exception:
                logger.exception("Cached graph is invalid; rebuilding it.")

        city = CITIES[city_key]
        logger.info(
            "Downloading %s pedestrian network, radius %s m",
            city_key,
            city["radius_m"],
        )

        try:
            graph = ox.graph_from_point(
                (city["latitude"], city["longitude"]),
                dist=city["radius_m"],
                dist_type="network",
                network_type=NETWORK_TYPE,
                simplify=True,
                retain_all=False,
                truncate_by_edge=True,
            )

            if len(graph) == 0 or graph.number_of_edges() == 0:
                raise ValueError("The returned pedestrian graph is empty.")

            # Cache atomically so an interrupted write does not
            # leave a partially written GraphML file.
            temporary_path = path.with_suffix(".tmp.graphml")
            ox.save_graphml(graph, filepath=temporary_path)
            temporary_path.replace(path)

            logger.info(
                "Built graph: %s nodes, %s edges",
                graph.number_of_nodes(),
                graph.number_of_edges(),
            )
            return graph

        except Exception as exc:
            logger.exception("Pedestrian graph build failed for %s", city_key)
            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not retrieve pedestrian network data. "
                    "Check internet access and OpenStreetMap/Overpass "
                    "service availability, then try again."
                ),
            ) from exc


def graph_summary(graph: nx.MultiDiGraph, city_key: str) -> dict[str, Any]:
    lengths = [
        float(data["length"])
        for _, _, _, data in graph.edges(keys=True, data=True)
        if data.get("length") is not None
    ]

    return {
        "city": CITIES[city_key]["name"],
        "state": CITIES[city_key]["state"],
        "network_type": NETWORK_TYPE,
        "study_radius_m": CITIES[city_key]["radius_m"],
        "nodes": graph.number_of_nodes(),
        "directed_edges": graph.number_of_edges(),
        "total_edge_length_km": round(sum(lengths) / 1000, 3),
        "average_edge_length_m": (
            round(sum(lengths) / len(lengths), 2)
            if lengths else 0
        ),
        "data_source": "OpenStreetMap",
        "cache_available": graph_cache_path(city_key).exists(),
        "safety_scores_available": True,
        "validated_safety_data": False,
    }


# ---------------------------------------------------------
# API endpoints
# ---------------------------------------------------------

@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "PATHGUARD API",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": "pathguard-api",
        "version": app.version,
    }


@app.get("/api/cities")
def list_cities() -> dict[str, Any]:
    return {
        "cities": [
            {
                "id": city_id,
                "name": data["name"],
                "state": data["state"],
                "latitude": data["latitude"],
                "longitude": data["longitude"],
                "study_radius_m": data["radius_m"],
            }
            for city_id, data in CITIES.items()
        ]
    }


@app.get("/api/network/{city}")
def get_network_summary(city: str) -> dict[str, Any]:
    city_key = normalize_city(city)
    graph = load_or_build_graph(city_key)
    return graph_summary(graph, city_key)


@app.get("/api/network/{city}/streets")
def get_street_geometry(
    city: str,
    limit: int = Query(default=5000, ge=1, le=15000),
) -> JSONResponse:
    city_key = normalize_city(city)
    graph = load_or_build_graph(city_key)

    try:
        edges = ox.convert.graph_to_gdfs(
            graph,
            nodes=False,
            edges=True,
            fill_edge_geometry=True,
        )

        # Keep response sizes bounded. A later stage can add
        # viewport-based loading and paginated vector data.
        edges = edges.head(limit)

        from shapely.geometry import mapping

        features = []
        for (u, v, key), edge in edges.iterrows():
            geometry = edge.geometry
            if geometry is None or geometry.is_empty:
                continue

            # GeoJSON coordinates are longitude, latitude.
            attributes = {
                name: clean_missing_attribute(value)
                for name, value in edge.to_dict().items()
            }
            assessment = score_street(attributes)

            highway = attributes.get("highway")
            name = attributes.get("name")
            features.append({
                "type": "Feature",
                "geometry": mapping(geometry),
                "properties": {
                    "from_node": str(u),
                    "to_node": str(v),
                    "edge_key": str(key),
                    "length_m": (
                        float(attributes["length"])
                        if attributes.get("length") is not None
                        else None
                    ),
                    "highway": str(highway) if highway is not None else None,
                    "name": str(name) if name is not None else None,
                    **assessment,
                },
            })

        return JSONResponse({
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "city": CITIES[city_key]["name"],
                "returned_edges": len(features),
                "total_graph_edges": graph.number_of_edges(),
                "truncated": len(edges) < graph.number_of_edges(),
                "data_source": "OpenStreetMap",
                "safety_scores_available": True,
                "validated_safety_data": False,
            },
        })

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not convert street geometry to GeoJSON")
        raise HTTPException(
            status_code=500,
            detail="Failed to convert the pedestrian network to GeoJSON.",
        ) from exc




def _distance_m(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Calculate approximate great-circle distance in metres."""
    radius = 6_371_000

    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )

    return radius * 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(max(0.0, 1.0 - a)),
    )


@app.get("/api/route/{city}")
def calculate_walking_route(
    city: str,
    start_lat: float = Query(..., ge=-90, le=90),
    start_lng: float = Query(..., ge=-180, le=180),
    end_lat: float = Query(..., ge=-90, le=90),
    end_lng: float = Query(..., ge=-180, le=180),
    mode: str = Query("balanced", pattern="^(safest|balanced|shortest)$"),
):
    """
    Calculate a pedestrian route on the mapped walking graph.

    Safety modes use heuristic scores derived from OSM attributes.
    They do not represent verified crime or incident data.
    """
    city_key = normalize_city(city)

    if (
        abs(start_lat - end_lat) < 1e-7
        and abs(start_lng - end_lng) < 1e-7
    ):
        raise HTTPException(
            status_code=422,
            detail="Choose two different locations.",
        )

    graph = load_or_build_graph(city_key)

    try:
        origin = ox.distance.nearest_nodes(
            graph,
            X=start_lng,
            Y=start_lat,
        )
        destination = ox.distance.nearest_nodes(
            graph,
            X=end_lng,
            Y=end_lat,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail="Could not snap the selected points to the walking network.",
        ) from exc

    origin_data = graph.nodes[origin]
    destination_data = graph.nodes[destination]

    origin_snap = _distance_m(
        start_lat,
        start_lng,
        float(origin_data["y"]),
        float(origin_data["x"]),
    )
    destination_snap = _distance_m(
        end_lat,
        end_lng,
        float(destination_data["y"]),
        float(destination_data["x"]),
    )

    max_snap_distance_m = 800

    if origin_snap > max_snap_distance_m:
        raise HTTPException(
            status_code=422,
            detail=(
                "The starting point is too far from a mapped walking street. "
                "Choose a point closer to the street network."
            ),
        )

    if destination_snap > max_snap_distance_m:
        raise HTTPException(
            status_code=422,
            detail=(
                "The destination is too far from a mapped walking street. "
                "Choose a point closer to the street network."
            ),
        )

    # Simplify parallel edges by keeping the lowest-cost edge for each
    # directed node pair. Original edge attributes are retained.
    routing_graph = nx.DiGraph()
    routing_graph.add_nodes_from(graph.nodes(data=True))

    for u, v, key, attributes in graph.edges(
        keys=True,
        data=True,
    ):
        try:
            length_m = float(attributes.get("length", 1))
        except (TypeError, ValueError):
            length_m = 1.0

        if not math.isfinite(length_m) or length_m <= 0:
            length_m = 1.0

        assessment = score_street(attributes)
        known_signals = assessment["known_signals"]

        # Unknown attributes must not be presented as known safety.
        effective_score = (
            assessment["safety_score"]
            if known_signals > 0
            else 40
        )

        
        highway_values = attributes.get("highway", [])
        if isinstance(highway_values, str):
            highway_values = [highway_values]
        highway_values = {
            str(value).lower()
            for value in highway_values
            if value is not None
        }

        foot_values = attributes.get("foot", [])
        if isinstance(foot_values, str):
            foot_values = [foot_values]
        foot_values = {
            str(value).lower()
            for value in foot_values
            if value is not None
        }

        sidewalk_values = attributes.get("sidewalk", [])
        if isinstance(sidewalk_values, str):
            sidewalk_values = [sidewalk_values]
        sidewalk_values = {
            str(value).lower()
            for value in sidewalk_values
            if value is not None
        }

        lit_values = attributes.get("lit", [])
        if isinstance(lit_values, str):
            lit_values = [lit_values]
        lit_values = {
            str(value).lower()
            for value in lit_values
            if value is not None
        }

        # Hard restriction: don't route over explicitly forbidden
        # pedestrian edges.
        if foot_values.intersection({"no", "private"}):
            continue

        # Base score and infrastructure evidence.
        assessment = score_street(attributes)
        known_signals = assessment["known_signals"]
        effective_score = assessment["safety_score"]

        # Start with distance. Apply transparent penalties for road
        # characteristics; these are proxies, not validated safety data.
        penalty = 0.0

        if highway_values.intersection(
            {"motorway", "motorway_link", "trunk", "trunk_link"}
        ):
            penalty += 3.0
        elif highway_values.intersection(
            {"primary", "primary_link", "secondary", "secondary_link"}
        ):
            penalty += 0.8
        elif highway_values.intersection(
            {"footway", "pedestrian", "path", "living_street"}
        ):
            penalty -= 0.2

        if sidewalk_values.intersection({"both", "left", "right", "yes", "separate"}):
            penalty -= 0.25
        elif sidewalk_values.intersection({"no", "none"}):
            penalty += 0.6

        if lit_values.intersection({"yes", "automatic"}):
            penalty -= 0.15
        elif lit_values.intersection({"no"}):
            penalty += 0.35

        # Never treat missing data as evidence of safety.
        if known_signals == 0:
            penalty += 0.2

        # Convert to a positive distance multiplier.
        multiplier = max(0.25, 1.0 + penalty)

        if mode == "shortest":
            weight = length_m
        elif mode == "balanced":
            weight = length_m * multiplier
        else:  # safest
            weight = length_m * (multiplier ** 2)

        edge = dict(attributes)
        edge["_route_length_m"] = length_m
        edge["_safety_score"] = effective_score
        edge["_known_signals"] = known_signals
        edge["_weight"] = weight
        edge["_original_key"] = str(key)

        if (
            not routing_graph.has_edge(u, v)
            or weight < routing_graph[u][v]["_weight"]
        ):
            routing_graph.add_edge(u, v, **edge)

    for u, v, key, attributes in graph.edges(keys=True, data=True):
        try:
            length_m = float(attributes.get("length", 1))
        except (TypeError, ValueError):
            length_m = 1.0

        if not math.isfinite(length_m) or length_m <= 0:
            length_m = 1.0

        assessment = score_street(attributes)
        known_signals = assessment["known_signals"]

        # Unknown attributes must not be presented as known safety.
        effective_score = (
            assessment["safety_score"]
            if known_signals > 0
            else 40
        )

        weight = length_m

        if mode == "shortest":
            weight = length_m
        elif mode == "balanced":
            weight = length_m
        else:  # safest
            weight = length_m
            

        edge = dict(attributes)
        edge["_route_length_m"] = length_m
        edge["_safety_score"] = effective_score
        edge["_known_signals"] = known_signals
        edge["_weight"] = weight
        edge["_original_key"] = str(key)

        if (
            not routing_graph.has_edge(u, v)
            or weight < routing_graph[u][v]["_weight"]
        ):
            routing_graph.add_edge(u, v, **edge)

    try:
        route_nodes = nx.shortest_path(
            routing_graph,
            source=origin,
            target=destination,
            weight="_weight",
            method="dijkstra",
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "No connected pedestrian route was found between "
                "these locations."
            ),
        ) from exc

    features = []
    total_distance_m = 0.0
    weighted_score_sum = 0.0
    known_distance_m = 0.0
    edge_count = 0

    for u, v in zip(route_nodes[:-1], route_nodes[1:]):
        edge = routing_graph[u][v]
        length_m = edge["_route_length_m"]
        score = edge["_safety_score"]
        known_signals = edge["_known_signals"]

        geometry = edge.get("geometry")

        if geometry is not None and hasattr(geometry, "coords"):
            coordinates = [
                [float(lon), float(lat)]
                for lon, lat, *_ in geometry.coords
            ]

            # OSM edge geometries normally follow u -> v, but normalize
            # their direction in case a cached graph stores them reversed.
            if len(coordinates) >= 2:
                u_data = graph.nodes[u]
                v_data = graph.nodes[v]

                start_distance = _distance_m(
                    float(u_data["y"]),
                    float(u_data["x"]),
                    coordinates[0][1],
                    coordinates[0][0],
                )
                end_distance = _distance_m(
                    float(v_data["y"]),
                    float(v_data["x"]),
                    coordinates[0][1],
                    coordinates[0][0],
                )

                if end_distance < start_distance:
                    coordinates.reverse()
            else:
                coordinates = []
        else:
            coordinates = []

        if len(coordinates) < 2:
            u_data = graph.nodes[u]
            v_data = graph.nodes[v]
            coordinates = [
                [float(u_data["x"]), float(u_data["y"])],
                [float(v_data["x"]), float(v_data["y"])],
            ]

        total_distance_m += length_m
        weighted_score_sum += score * length_m
        edge_count += 1

        if known_signals > 0:
            known_distance_m += length_m

        highway = edge.get("highway")
        name = edge.get("name")

        features.append({
            "type": "Feature",
            "geometry": mapping(LineString(coordinates)),
            "properties": {
                "name": str(name) if name is not None else None,
                "highway": str(highway) if highway is not None else None,
                "length_m": round(length_m, 2),
                "safety_score": score,
                "risk_level": score_street(edge)["risk_level"],
                "data_completeness": (
                    "some_mapped_attributes"
                    if known_signals > 0
                    else "insufficient_data"
                ),
            },
        })

    average_score = (
        weighted_score_sum / total_distance_m
        if total_distance_m > 0
        else None
    )

    # Approximation only: walking speed of 1.25 m/s.
    estimated_minutes = total_distance_m / 1.25 / 60

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "city": city_key,
            "mode": mode,
            "distance_m": round(total_distance_m, 1),
            "distance_km": round(total_distance_m / 1000, 2),
            "estimated_walking_minutes": round(estimated_minutes, 1),
            "average_estimated_safety_score": (
                round(average_score, 1)
                if average_score is not None
                else None
            ),
            "mapped_attribute_coverage_percent": (
                round(known_distance_m / total_distance_m * 100, 1)
                if total_distance_m > 0
                else 0
            ),
            "route_segments": edge_count,
            "snapped_start_distance_m": round(origin_snap, 1),
            "snapped_end_distance_m": round(destination_snap, 1),
            "data_source": "OpenStreetMap",
            "safety_model": "osm_heuristic_v1",
            "validated_safety_data": False,
        },
    }
