"""
Timezone utilities for organization-based timezone management.
Maps countries to their default IANA timezones.
"""

# Country to default IANA timezone mapping
# For countries with multiple timezones, we use the most common/capital timezone
COUNTRY_TIMEZONE_MAP = {
    # Asia
    "India": "Asia/Kolkata",
    "China": "Asia/Shanghai",
    "Japan": "Asia/Tokyo",
    "South Korea": "Asia/Seoul",
    "Singapore": "Asia/Singapore",
    "Malaysia": "Asia/Kuala_Lumpur",
    "Thailand": "Asia/Bangkok",
    "Vietnam": "Asia/Ho_Chi_Minh",
    "Indonesia": "Asia/Jakarta",
    "Philippines": "Asia/Manila",
    "Pakistan": "Asia/Karachi",
    "Bangladesh": "Asia/Dhaka",
    "Sri Lanka": "Asia/Colombo",
    "Nepal": "Asia/Kathmandu",
    "Myanmar": "Asia/Yangon",
    "Cambodia": "Asia/Phnom_Penh",
    "UAE": "Asia/Dubai",
    "United Arab Emirates": "Asia/Dubai",
    "Saudi Arabia": "Asia/Riyadh",
    "Qatar": "Asia/Qatar",
    "Kuwait": "Asia/Kuwait",
    "Bahrain": "Asia/Bahrain",
    "Oman": "Asia/Muscat",
    "Israel": "Asia/Jerusalem",
    "Turkey": "Europe/Istanbul",
    "Hong Kong": "Asia/Hong_Kong",
    "Taiwan": "Asia/Taipei",
    
    # Europe
    "United Kingdom": "Europe/London",
    "UK": "Europe/London",
    "Germany": "Europe/Berlin",
    "France": "Europe/Paris",
    "Italy": "Europe/Rome",
    "Spain": "Europe/Madrid",
    "Netherlands": "Europe/Amsterdam",
    "Belgium": "Europe/Brussels",
    "Switzerland": "Europe/Zurich",
    "Austria": "Europe/Vienna",
    "Poland": "Europe/Warsaw",
    "Sweden": "Europe/Stockholm",
    "Norway": "Europe/Oslo",
    "Denmark": "Europe/Copenhagen",
    "Finland": "Europe/Helsinki",
    "Ireland": "Europe/Dublin",
    "Portugal": "Europe/Lisbon",
    "Greece": "Europe/Athens",
    "Czech Republic": "Europe/Prague",
    "Romania": "Europe/Bucharest",
    "Hungary": "Europe/Budapest",
    "Russia": "Europe/Moscow",
    "Ukraine": "Europe/Kiev",
    
    # Americas
    "United States": "America/New_York",
    "USA": "America/New_York",
    "US": "America/New_York",
    "Canada": "America/Toronto",
    "Mexico": "America/Mexico_City",
    "Brazil": "America/Sao_Paulo",
    "Argentina": "America/Buenos_Aires",
    "Chile": "America/Santiago",
    "Colombia": "America/Bogota",
    "Peru": "America/Lima",
    "Venezuela": "America/Caracas",
    
    # Oceania
    "Australia": "Australia/Sydney",
    "New Zealand": "Pacific/Auckland",
    
    # Africa
    "South Africa": "Africa/Johannesburg",
    "Egypt": "Africa/Cairo",
    "Nigeria": "Africa/Lagos",
    "Kenya": "Africa/Nairobi",
    "Morocco": "Africa/Casablanca",
    "Ghana": "Africa/Accra",
    "Ethiopia": "Africa/Addis_Ababa",
}

# Common IANA timezones for dropdown selection
COMMON_TIMEZONES = [
    # UTC
    {"value": "UTC", "label": "UTC (Coordinated Universal Time)", "offset": "+00:00"},
    
    # Asia
    {"value": "Asia/Kolkata", "label": "IST (India Standard Time)", "offset": "+05:30"},
    {"value": "Asia/Dubai", "label": "GST (Gulf Standard Time)", "offset": "+04:00"},
    {"value": "Asia/Singapore", "label": "SGT (Singapore Time)", "offset": "+08:00"},
    {"value": "Asia/Hong_Kong", "label": "HKT (Hong Kong Time)", "offset": "+08:00"},
    {"value": "Asia/Tokyo", "label": "JST (Japan Standard Time)", "offset": "+09:00"},
    {"value": "Asia/Shanghai", "label": "CST (China Standard Time)", "offset": "+08:00"},
    {"value": "Asia/Seoul", "label": "KST (Korea Standard Time)", "offset": "+09:00"},
    {"value": "Asia/Jakarta", "label": "WIB (Western Indonesia Time)", "offset": "+07:00"},
    {"value": "Asia/Bangkok", "label": "ICT (Indochina Time)", "offset": "+07:00"},
    {"value": "Asia/Karachi", "label": "PKT (Pakistan Standard Time)", "offset": "+05:00"},
    {"value": "Asia/Dhaka", "label": "BST (Bangladesh Standard Time)", "offset": "+06:00"},
    
    # Europe
    {"value": "Europe/London", "label": "GMT/BST (UK Time)", "offset": "+00:00"},
    {"value": "Europe/Paris", "label": "CET (Central European Time)", "offset": "+01:00"},
    {"value": "Europe/Berlin", "label": "CET (Central European Time)", "offset": "+01:00"},
    {"value": "Europe/Moscow", "label": "MSK (Moscow Standard Time)", "offset": "+03:00"},
    {"value": "Europe/Istanbul", "label": "TRT (Turkey Time)", "offset": "+03:00"},
    
    # Americas
    {"value": "America/New_York", "label": "EST/EDT (US Eastern)", "offset": "-05:00"},
    {"value": "America/Chicago", "label": "CST/CDT (US Central)", "offset": "-06:00"},
    {"value": "America/Denver", "label": "MST/MDT (US Mountain)", "offset": "-07:00"},
    {"value": "America/Los_Angeles", "label": "PST/PDT (US Pacific)", "offset": "-08:00"},
    {"value": "America/Toronto", "label": "EST/EDT (Canada Eastern)", "offset": "-05:00"},
    {"value": "America/Vancouver", "label": "PST/PDT (Canada Pacific)", "offset": "-08:00"},
    {"value": "America/Sao_Paulo", "label": "BRT (Brasilia Time)", "offset": "-03:00"},
    {"value": "America/Mexico_City", "label": "CST (Mexico Central)", "offset": "-06:00"},
    
    # Oceania
    {"value": "Australia/Sydney", "label": "AEST/AEDT (Australia Eastern)", "offset": "+10:00"},
    {"value": "Australia/Perth", "label": "AWST (Australia Western)", "offset": "+08:00"},
    {"value": "Pacific/Auckland", "label": "NZST/NZDT (New Zealand)", "offset": "+12:00"},
    
    # Africa
    {"value": "Africa/Johannesburg", "label": "SAST (South Africa)", "offset": "+02:00"},
    {"value": "Africa/Cairo", "label": "EET (Egypt)", "offset": "+02:00"},
    {"value": "Africa/Lagos", "label": "WAT (West Africa Time)", "offset": "+01:00"},
]


def get_default_timezone_for_country(country: str) -> str:
    """
    Get the default IANA timezone for a country.
    Returns 'UTC' if country is not found in the mapping.
    
    Args:
        country: Country name (case-insensitive matching attempted)
    
    Returns:
        IANA timezone string (e.g., 'Asia/Kolkata')
    """
    if not country:
        return "UTC"
    
    # Try exact match first
    if country in COUNTRY_TIMEZONE_MAP:
        return COUNTRY_TIMEZONE_MAP[country]
    
    # Try case-insensitive match
    country_lower = country.lower().strip()
    for key, value in COUNTRY_TIMEZONE_MAP.items():
        if key.lower() == country_lower:
            return value
    
    # Default to UTC if no match
    return "UTC"


def get_common_timezones() -> list:
    """
    Get list of common timezones for dropdown selection.
    
    Returns:
        List of timezone dictionaries with value, label, and offset
    """
    return COMMON_TIMEZONES


def is_valid_timezone(timezone: str) -> bool:
    """
    Check if a timezone string is a valid IANA timezone.
    
    Args:
        timezone: IANA timezone string to validate
    
    Returns:
        True if valid, False otherwise
    """
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(timezone)
        return True
    except Exception:
        return False
