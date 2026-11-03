"""Country name (as written in the EC default-value tables / customs data) -> ISO 3166-1 numeric + alpha-3.

The numeric code matches the `id` of world-atlas TopoJSON features, so the frontend map can shade countries.
Names are matched accent- and case-insensitively; the EC file's mis-encoded sheet names are listed as aliases.
"""
import unicodedata

_COUNTRIES = {
    "Albania": ("008", "ALB"), "Algeria": ("012", "DZA"), "Angola": ("024", "AGO"), "Argentina": ("032", "ARG"),
    "Armenia": ("051", "ARM"), "Australia": ("036", "AUS"), "Azerbaijan": ("031", "AZE"), "Bahrain": ("048", "BHR"),
    "Bangladesh": ("050", "BGD"), "Belarus": ("112", "BLR"), "Benin": ("204", "BEN"), "Bolivia": ("068", "BOL"),
    "Bosnia and Herzegovina": ("070", "BIH"), "Brazil": ("076", "BRA"), "Brunei": ("096", "BRN"), "Cambodia": ("116", "KHM"),
    "Cameroon": ("120", "CMR"), "Canada": ("124", "CAN"), "Chile": ("152", "CHL"), "China": ("156", "CHN"),
    "Colombia": ("170", "COL"), "Congo": ("178", "COG"), "Congo, Democratic Republic of": ("180", "COD"),
    "Costa Rica": ("188", "CRI"), "Cuba": ("192", "CUB"), "Curacao": ("531", "CUW"), "Cura�ao": ("531", "CUW"),
    "Dominican Republic": ("214", "DOM"), "Ecuador": ("218", "ECU"), "Egypt": ("818", "EGY"), "El Salvador": ("222", "SLV"),
    "Equatorial Guinea": ("226", "GNQ"), "Eritrea": ("232", "ERI"), "Eswatini": ("748", "SWZ"), "Ethiopia": ("231", "ETH"),
    "Gabon": ("266", "GAB"), "Georgia": ("268", "GEO"), "Ghana": ("288", "GHA"), "Guatemala": ("320", "GTM"),
    "Haiti": ("332", "HTI"), "Honduras": ("340", "HND"), "Hong Kong": ("344", "HKG"), "India": ("356", "IND"),
    "Indonesia": ("360", "IDN"), "Iran": ("364", "IRN"), "Iran, Islamic Republic of": ("364", "IRN"), "Iraq": ("368", "IRQ"),
    "Israel": ("376", "ISR"), "Ivory Coast": ("384", "CIV"), "Cote d'Ivoire": ("384", "CIV"), "Jamaica": ("388", "JAM"),
    "Japan": ("392", "JPN"), "Jordan": ("400", "JOR"), "Kazakhstan": ("398", "KAZ"), "Kenya": ("404", "KEN"),
    "Kosovo": ("-99", "XKX"), "Kuwait": ("414", "KWT"), "Kyrgyzstan": ("417", "KGZ"), "Laos": ("418", "LAO"),
    "Lebanon": ("422", "LBN"), "Liberia": ("430", "LBR"), "Libya": ("434", "LBY"), "Madagascar": ("450", "MDG"),
    "Malaysia": ("458", "MYS"), "Mali": ("466", "MLI"), "Mauritania": ("478", "MRT"), "Mauritius": ("480", "MUS"),
    "Mexico": ("484", "MEX"), "Moldova": ("498", "MDA"), "Moldova, Republic of": ("498", "MDA"), "Mongolia": ("496", "MNG"),
    "Montenegro": ("499", "MNE"), "Morocco": ("504", "MAR"), "Mozambique": ("508", "MOZ"), "Myanmar": ("104", "MMR"),
    "Namibia": ("516", "NAM"), "Nepal": ("524", "NPL"), "New Caledonia and dependencies": ("540", "NCL"),
    "New Caledonia": ("540", "NCL"), "New Zealand": ("554", "NZL"), "Nicaragua": ("558", "NIC"), "Niger": ("562", "NER"),
    "Nigeria": ("566", "NGA"), "North Korea": ("408", "PRK"), "North Korea (Democratic People's Republic of Korea)": ("408", "PRK"),
    "North Macedonia": ("807", "MKD"), "Oman": ("512", "OMN"), "Pakistan": ("586", "PAK"), "Panama": ("591", "PAN"),
    "Papua New Guinea": ("598", "PNG"), "Paraguay": ("600", "PRY"), "Peru": ("604", "PER"), "Philippines": ("608", "PHL"),
    "Qatar": ("634", "QAT"), "Russia": ("643", "RUS"), "Russian Federation": ("643", "RUS"), "Rwanda": ("646", "RWA"),
    "Saudi Arabia": ("682", "SAU"), "Senegal": ("686", "SEN"), "Serbia": ("688", "SRB"), "Sierra Leone": ("694", "SLE"),
    "Singapore": ("702", "SGP"), "South Africa": ("710", "ZAF"), "South Korea": ("410", "KOR"), "Korea": ("410", "KOR"),
    "Korea, Republic of": ("410", "KOR"), "Korea, Republic of (South Korea)": ("410", "KOR"), "Sri Lanka": ("144", "LKA"),
    "Sudan": ("729", "SDN"), "Suriname": ("740", "SUR"), "Syria": ("760", "SYR"), "Taiwan": ("158", "TWN"),
    "Tajikistan": ("762", "TJK"), "Tanzania": ("834", "TZA"), "Tanzania, United Republic of": ("834", "TZA"),
    "Thailand": ("764", "THA"), "Togo": ("768", "TGO"), "Trinidad and Tobago": ("780", "TTO"), "Tunisia": ("788", "TUN"),
    "Turkey": ("792", "TUR"), "Türkiye": ("792", "TUR"), "T�rkiye": ("792", "TUR"), "Turkmenistan": ("795", "TKM"),
    "Uganda": ("800", "UGA"), "Ukraine": ("804", "UKR"), "United Arab Emirates": ("784", "ARE"), "UAE": ("784", "ARE"),
    "United Kingdom": ("826", "GBR"), "United States": ("840", "USA"), "USA": ("840", "USA"), "Uruguay": ("858", "URY"),
    "Uzbekistan": ("860", "UZB"), "Venezuela": ("862", "VEN"), "Vietnam": ("704", "VNM"), "Viet Nam": ("704", "VNM"),
    "Yemen": ("887", "YEM"), "Zambia": ("894", "ZMB"), "Zimbabwe": ("716", "ZWE"),
}


def _key(name: str) -> str:
    return unicodedata.normalize("NFKD", name.replace("�", "")).encode("ascii", "ignore").decode().lower().strip()


_INDEX = {_key(k): v for k, v in _COUNTRIES.items()}


def iso_of(name: str | None) -> dict:
    """{"iso_num": "356", "iso3": "IND"} or empty strings when unknown."""
    hit = _INDEX.get(_key(name or ""))
    return {"iso_num": hit[0], "iso3": hit[1]} if hit else {"iso_num": "", "iso3": ""}
