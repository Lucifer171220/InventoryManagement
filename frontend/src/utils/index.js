export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
}

export function resolveApiAssetUrl(url, apiBaseUrl) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, "");
  return `${apiOrigin}${url}`;
}

export function formatPostalPlaceAddress(place, country, postalCode) {
  return [
    place["place name"],
    place.district,
    place.state,
    country,
    postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function roleClass(role) {
  return role === "manager" ? "role-manager" : role === "moderator" ? "role-moderator" : "role-user";
}
