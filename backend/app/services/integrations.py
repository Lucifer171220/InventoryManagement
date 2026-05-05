import math
from typing import Optional

import httpx
from fastapi import HTTPException

from app.config import get_settings


settings = get_settings()


async def lookup_postal_code(country_code: str, postal_code: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        normalized_country = country_code.upper()

        try:
            if normalized_country == "IN":
                response = await client.get(f"https://api.postalpincode.in/pincode/{postal_code}")
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, list) or not payload:
                    raise HTTPException(status_code=502, detail="Unexpected postal lookup response")
                record = payload[0]
                if record.get("Status") != "Success":
                    raise HTTPException(status_code=404, detail="Postal code not found")
                offices = record.get("PostOffice") or []
                places = [
                    {
                        "place name": office.get("Name", ""),
                        "state": office.get("State", ""),
                        "district": office.get("District", ""),
                        "country": office.get("Country", "India"),
                    }
                    for office in offices
                ]
                return {
                    "country": "India",
                    "post code": postal_code,
                    "places": places,
                }

            response = await client.get(f"https://api.zippopotam.us/{normalized_country}/{postal_code}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise HTTPException(status_code=404, detail="Postal code not found") from exc
            raise HTTPException(status_code=502, detail="Postal lookup provider error") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Postal lookup service unavailable") from exc


async def lookup_barcode(barcode: str) -> dict:
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


async def geocode_address(address: str) -> Optional[dict]:
    params = {"q": address, "format": "jsonv2", "limit": 1}
    headers = {"User-Agent": "inventory-ai-manager/1.0"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get("https://nominatim.openstreetmap.org/search", params=params, headers=headers)
        response.raise_for_status()
        results = response.json()
        return results[0] if results else None


async def route_distance_km(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
) -> tuple[float, str]:
    if settings.openrouteservice_api_key:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openrouteservice.org/v2/directions/driving-car",
                headers={
                    "Authorization": settings.openrouteservice_api_key,
                    "Content-Type": "application/json",
                },
                json={"coordinates": [[origin_lng, origin_lat], [destination_lng, destination_lat]]},
            )
            response.raise_for_status()
            data = response.json()
            meters = data["routes"][0]["summary"]["distance"]
            return round(meters / 1000, 2), "openrouteservice"

    return round(haversine_km(origin_lat, origin_lng, destination_lat, destination_lng), 2), "local-estimator"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * radius_km * math.asin(math.sqrt(a))


def build_map_link(lat: float, lng: float) -> str:
    return f"https://www.openstreetmap.org/?mlat={lat}&mlon={lng}#map=12/{lat}/{lng}"
