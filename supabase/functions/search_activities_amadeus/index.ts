// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const AMADEUS_BASE = "https://test.api.amadeus.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ActivityOffer {
  id: string;
  name: string;
  short_description: string | null;
  rating: string | null;
  price_amount: string | null;
  price_currency: string | null;
  picture_url: string | null;
  booking_link: string | null;
  categories: string[];
  is_free: boolean;
}

// Airport IATA → city-centre coordinates (~200 major airports worldwide)
const AIRPORT_COORDS: Record<string, { latitude: number; longitude: number }> = {
  // North America – USA
  ATL: { latitude: 33.7490,  longitude: -84.3880  },
  LAX: { latitude: 34.0522,  longitude: -118.2437 },
  ORD: { latitude: 41.8781,  longitude: -87.6298  },
  DFW: { latitude: 32.7767,  longitude: -96.7970  },
  DEN: { latitude: 39.7392,  longitude: -104.9903 },
  JFK: { latitude: 40.7128,  longitude: -74.0060  },
  EWR: { latitude: 40.7357,  longitude: -74.1724  },
  LGA: { latitude: 40.7769,  longitude: -73.8740  },
  SFO: { latitude: 37.7749,  longitude: -122.4194 },
  SEA: { latitude: 47.6062,  longitude: -122.3321 },
  LAS: { latitude: 36.1699,  longitude: -115.1398 },
  MCO: { latitude: 28.5383,  longitude: -81.3792  },
  MIA: { latitude: 25.7617,  longitude: -80.1918  },
  FLL: { latitude: 26.1224,  longitude: -80.1373  },
  CLT: { latitude: 35.2271,  longitude: -80.8431  },
  PHX: { latitude: 33.4484,  longitude: -112.0740 },
  IAH: { latitude: 29.7604,  longitude: -95.3698  },
  HOU: { latitude: 29.7604,  longitude: -95.3698  },
  BOS: { latitude: 42.3601,  longitude: -71.0589  },
  MSP: { latitude: 44.9778,  longitude: -93.2650  },
  DTW: { latitude: 42.3314,  longitude: -83.0458  },
  PHL: { latitude: 39.9526,  longitude: -75.1652  },
  DCA: { latitude: 38.9072,  longitude: -77.0369  },
  IAD: { latitude: 38.9531,  longitude: -77.4565  },
  BWI: { latitude: 39.2904,  longitude: -76.6122  },
  SAN: { latitude: 32.7157,  longitude: -117.1611 },
  TPA: { latitude: 27.9506,  longitude: -82.4572  },
  PDX: { latitude: 45.5051,  longitude: -122.6750 },
  SLC: { latitude: 40.7608,  longitude: -111.8910 },
  STL: { latitude: 38.6270,  longitude: -90.1994  },
  HNL: { latitude: 21.3069,  longitude: -157.8583 },
  AUS: { latitude: 30.2672,  longitude: -97.7431  },
  MCI: { latitude: 39.0997,  longitude: -94.5786  },
  RDU: { latitude: 35.8801,  longitude: -78.7880  },
  SJC: { latitude: 37.3382,  longitude: -121.8863 },
  OAK: { latitude: 37.8044,  longitude: -122.2712 },
  BNA: { latitude: 36.1627,  longitude: -86.7816  },
  MSY: { latitude: 29.9511,  longitude: -90.0715  },
  CLE: { latitude: 41.4993,  longitude: -81.6944  },
  IND: { latitude: 39.7684,  longitude: -86.1581  },
  CMH: { latitude: 39.9612,  longitude: -82.9988  },
  PIT: { latitude: 40.4406,  longitude: -79.9959  },
  SAT: { latitude: 29.4241,  longitude: -98.4936  },
  ABQ: { latitude: 35.0844,  longitude: -106.6504 },
  OGG: { latitude: 20.8893,  longitude: -156.4729 },
  KOA: { latitude: 19.6400,  longitude: -155.9969 },
  LIH: { latitude: 22.0964,  longitude: -159.3380 },
  ANC: { latitude: 61.2181,  longitude: -149.9003 },
  SJU: { latitude: 18.4655,  longitude: -66.1057  },
  MKE: { latitude: 43.0389,  longitude: -87.9065  },
  OMA: { latitude: 41.2565,  longitude: -95.9345  },
  BDL: { latitude: 41.7658,  longitude: -72.6851  },
  PBI: { latitude: 26.7153,  longitude: -80.0534  },
  RSW: { latitude: 26.5362,  longitude: -81.7552  },
  JAX: { latitude: 30.3322,  longitude: -81.6557  },
  DAL: { latitude: 32.7767,  longitude: -96.7970  },
  MDW: { latitude: 41.8781,  longitude: -87.6298  },
  OKC: { latitude: 35.4676,  longitude: -97.5164  },
  TUL: { latitude: 36.1540,  longitude: -95.9928  },
  BUF: { latitude: 42.8864,  longitude: -78.8784  },
  ALB: { latitude: 42.6526,  longitude: -73.7562  },
  SYR: { latitude: 43.0481,  longitude: -76.1474  },
  CVG: { latitude: 39.1031,  longitude: -84.5120  },
  GRR: { latitude: 42.9634,  longitude: -85.6681  },
  // North America – Canada
  YYZ: { latitude: 43.6532,  longitude: -79.3832  },
  YVR: { latitude: 49.2827,  longitude: -123.1207 },
  YUL: { latitude: 45.5017,  longitude: -73.5673  },
  YYC: { latitude: 51.0447,  longitude: -114.0719 },
  YEG: { latitude: 53.5461,  longitude: -113.4938 },
  YOW: { latitude: 45.4215,  longitude: -75.6972  },
  YWG: { latitude: 49.8951,  longitude: -97.1384  },
  YHZ: { latitude: 44.6488,  longitude: -63.5752  },
  YQB: { latitude: 46.8139,  longitude: -71.2080  },
  // North America – Mexico & Caribbean
  MEX: { latitude: 19.4326,  longitude: -99.1332  },
  CUN: { latitude: 21.1619,  longitude: -86.8515  },
  GDL: { latitude: 20.6597,  longitude: -103.3496 },
  MTY: { latitude: 25.6866,  longitude: -100.3161 },
  SJD: { latitude: 23.1653,  longitude: -109.7170 },
  PVR: { latitude: 20.6534,  longitude: -105.2253 },
  MID: { latitude: 20.9674,  longitude: -89.6233  },
  NAS: { latitude: 25.0480,  longitude: -77.3562  },
  MBJ: { latitude: 18.5017,  longitude: -77.8978  },
  KIN: { latitude: 17.9977,  longitude: -76.7876  },
  HAV: { latitude: 23.1136,  longitude: -82.3666  },
  SDQ: { latitude: 18.4861,  longitude: -69.9312  },
  PUJ: { latitude: 18.5671,  longitude: -68.3634  },
  STT: { latitude: 18.3430,  longitude: -64.9307  },
  // Central & South America
  BOG: { latitude: 4.7110,   longitude: -74.0721  },
  LIM: { latitude: -12.0464, longitude: -77.0428  },
  SCL: { latitude: -33.4489, longitude: -70.6693  },
  GRU: { latitude: -23.5505, longitude: -46.6333  },
  GIG: { latitude: -22.9068, longitude: -43.1729  },
  EZE: { latitude: -34.6037, longitude: -58.3816  },
  UIO: { latitude: -0.1807,  longitude: -78.4678  },
  MDE: { latitude: 6.2442,   longitude: -75.5812  },
  PTY: { latitude: 8.9936,   longitude: -79.5197  },
  SJO: { latitude: 9.9281,   longitude: -84.0907  },
  GUA: { latitude: 14.6349,  longitude: -90.5069  },
  SAL: { latitude: 13.6929,  longitude: -89.2182  },
  MVD: { latitude: -34.9011, longitude: -56.1645  },
  ASU: { latitude: -25.2867, longitude: -57.6473  },
  LPB: { latitude: -16.5000, longitude: -68.1500  },
  // Europe – Western
  LHR: { latitude: 51.5074,  longitude: -0.1278   },
  LGW: { latitude: 51.1537,  longitude: -0.1821   },
  STN: { latitude: 51.8860,  longitude: 0.2389    },
  LTN: { latitude: 51.8747,  longitude: -0.3683   },
  CDG: { latitude: 48.8566,  longitude: 2.3522    },
  ORY: { latitude: 48.7253,  longitude: 2.3580    },
  AMS: { latitude: 52.3676,  longitude: 4.9041    },
  FRA: { latitude: 50.1109,  longitude: 8.6821    },
  MUC: { latitude: 48.1351,  longitude: 11.5820   },
  BER: { latitude: 52.5200,  longitude: 13.4050   },
  HAM: { latitude: 53.5753,  longitude: 10.0153   },
  DUS: { latitude: 51.2217,  longitude: 6.7762    },
  MAD: { latitude: 40.4168,  longitude: -3.7038   },
  BCN: { latitude: 41.3851,  longitude: 2.1734    },
  VLC: { latitude: 39.4699,  longitude: -0.3763   },
  AGP: { latitude: 36.7213,  longitude: -4.4213   },
  PMI: { latitude: 39.5696,  longitude: 2.6502    },
  FCO: { latitude: 41.9028,  longitude: 12.4964   },
  MXP: { latitude: 45.4642,  longitude: 9.1900    },
  BGY: { latitude: 45.6949,  longitude: 9.7003    },
  NAP: { latitude: 40.8518,  longitude: 14.2681   },
  VCE: { latitude: 45.4408,  longitude: 12.3155   },
  LIS: { latitude: 38.7223,  longitude: -9.1393   },
  OPO: { latitude: 41.1579,  longitude: -8.6291   },
  ZRH: { latitude: 47.3769,  longitude: 8.5417    },
  GVA: { latitude: 46.2044,  longitude: 6.1432    },
  BRU: { latitude: 50.8503,  longitude: 4.3517    },
  DUB: { latitude: 53.3498,  longitude: -6.2603   },
  LUX: { latitude: 49.6117,  longitude: 6.1319    },
  // Europe – Northern
  CPH: { latitude: 55.6761,  longitude: 12.5683   },
  OSL: { latitude: 59.9139,  longitude: 10.7522   },
  ARN: { latitude: 59.3293,  longitude: 18.0686   },
  GOT: { latitude: 57.7089,  longitude: 11.9746   },
  HEL: { latitude: 60.1699,  longitude: 24.9384   },
  RIX: { latitude: 56.9460,  longitude: 24.1059   },
  TLL: { latitude: 59.4370,  longitude: 24.7536   },
  VNO: { latitude: 54.6872,  longitude: 25.2797   },
  KEF: { latitude: 64.1355,  longitude: -21.8954  },
  // Europe – Central & Eastern
  VIE: { latitude: 48.2082,  longitude: 16.3738   },
  PRG: { latitude: 50.0755,  longitude: 14.4378   },
  BUD: { latitude: 47.4979,  longitude: 19.0402   },
  WAW: { latitude: 52.2297,  longitude: 21.0122   },
  KRK: { latitude: 50.0647,  longitude: 19.9450   },
  GDN: { latitude: 54.3520,  longitude: 18.6466   },
  WRO: { latitude: 51.1079,  longitude: 17.0385   },
  OTP: { latitude: 44.4268,  longitude: 26.1025   },
  SOF: { latitude: 42.6977,  longitude: 23.3219   },
  BEG: { latitude: 44.8176,  longitude: 20.4633   },
  ZAG: { latitude: 45.8150,  longitude: 15.9819   },
  LJU: { latitude: 46.0569,  longitude: 14.5058   },
  SKP: { latitude: 41.9981,  longitude: 21.4254   },
  SVO: { latitude: 55.7558,  longitude: 37.6173   },
  LED: { latitude: 59.9343,  longitude: 30.3351   },
  KBP: { latitude: 50.4501,  longitude: 30.5234   },
  ATH: { latitude: 37.9838,  longitude: 23.7275   },
  SKG: { latitude: 40.6401,  longitude: 22.9444   },
  // Middle East
  DXB: { latitude: 25.2048,  longitude: 55.2708   },
  AUH: { latitude: 24.4539,  longitude: 54.3773   },
  DOH: { latitude: 25.2854,  longitude: 51.5310   },
  KWI: { latitude: 29.3759,  longitude: 47.9774   },
  BAH: { latitude: 26.2172,  longitude: 50.5960   },
  MCT: { latitude: 23.5880,  longitude: 58.3829   },
  RUH: { latitude: 24.7136,  longitude: 46.6753   },
  JED: { latitude: 21.4858,  longitude: 39.1925   },
  AMM: { latitude: 31.9539,  longitude: 35.9106   },
  BEY: { latitude: 33.8938,  longitude: 35.5018   },
  TLV: { latitude: 32.0853,  longitude: 34.7818   },
  IST: { latitude: 41.0082,  longitude: 28.9784   },
  SAW: { latitude: 40.8986,  longitude: 29.3092   },
  AYT: { latitude: 36.8969,  longitude: 30.7133   },
  // Africa
  CAI: { latitude: 30.0444,  longitude: 31.2357   },
  CMN: { latitude: 33.5731,  longitude: -7.5898   },
  RAK: { latitude: 31.6295,  longitude: -7.9811   },
  TUN: { latitude: 36.8065,  longitude: 10.1815   },
  ALG: { latitude: 36.7372,  longitude: 3.0863    },
  ADD: { latitude: 9.0320,   longitude: 38.7469   },
  NBO: { latitude: 1.2921,   longitude: 36.8219   },
  MBA: { latitude: -4.0435,  longitude: 39.6682   },
  DAR: { latitude: -6.7924,  longitude: 39.2083   },
  EBB: { latitude: 0.3476,   longitude: 32.5825   },
  LOS: { latitude: 6.5244,   longitude: 3.3792    },
  ABV: { latitude: 9.0574,   longitude: 7.4898    },
  ACC: { latitude: 5.6037,   longitude: -0.1870   },
  JNB: { latitude: -26.2041, longitude: 28.0473   },
  CPT: { latitude: -33.9249, longitude: 18.4241   },
  DUR: { latitude: -29.8587, longitude: 31.0218   },
  MRU: { latitude: -20.1609, longitude: 57.4989   },
  // Asia – East
  PEK: { latitude: 39.9042,  longitude: 116.4074  },
  PKX: { latitude: 39.5098,  longitude: 116.4105  },
  PVG: { latitude: 31.2304,  longitude: 121.4737  },
  SHA: { latitude: 31.1979,  longitude: 121.3370  },
  CAN: { latitude: 23.1291,  longitude: 113.2644  },
  SZX: { latitude: 22.5431,  longitude: 114.0579  },
  HKG: { latitude: 22.3193,  longitude: 114.1694  },
  CTU: { latitude: 30.5728,  longitude: 104.0668  },
  CKG: { latitude: 29.5630,  longitude: 106.5516  },
  XMN: { latitude: 24.4798,  longitude: 118.0894  },
  TPE: { latitude: 25.0330,  longitude: 121.5654  },
  MFM: { latitude: 22.1987,  longitude: 113.5439  },
  NRT: { latitude: 35.6762,  longitude: 139.6503  },
  HND: { latitude: 35.6762,  longitude: 139.6503  },
  KIX: { latitude: 34.6937,  longitude: 135.5023  },
  CTS: { latitude: 43.0618,  longitude: 141.3545  },
  FUK: { latitude: 33.5904,  longitude: 130.4017  },
  NGO: { latitude: 35.1815,  longitude: 136.9066  },
  OKA: { latitude: 26.2124,  longitude: 127.6809  },
  ICN: { latitude: 37.5665,  longitude: 126.9780  },
  PUS: { latitude: 35.1796,  longitude: 129.0756  },
  // Asia – Southeast
  SIN: { latitude: 1.3521,   longitude: 103.8198  },
  KUL: { latitude: 3.1390,   longitude: 101.6869  },
  BKK: { latitude: 13.7563,  longitude: 100.5018  },
  CNX: { latitude: 18.7883,  longitude: 98.9853   },
  HKT: { latitude: 7.8804,   longitude: 98.3923   },
  USM: { latitude: 9.5121,   longitude: 100.0613  },
  SGN: { latitude: 10.8231,  longitude: 106.6297  },
  HAN: { latitude: 21.0285,  longitude: 105.8542  },
  DAD: { latitude: 16.0544,  longitude: 108.2022  },
  RGN: { latitude: 16.8409,  longitude: 96.1735   },
  REP: { latitude: 13.4125,  longitude: 103.8670  },
  PNH: { latitude: 11.5564,  longitude: 104.9282  },
  MNL: { latitude: 14.5995,  longitude: 120.9842  },
  CEB: { latitude: 10.3157,  longitude: 123.8854  },
  DPS: { latitude: -8.6705,  longitude: 115.2126  },
  CGK: { latitude: -6.2088,  longitude: 106.8456  },
  // Asia – South
  DEL: { latitude: 28.6139,  longitude: 77.2090   },
  BOM: { latitude: 19.0760,  longitude: 72.8777   },
  MAA: { latitude: 13.0827,  longitude: 80.2707   },
  BLR: { latitude: 12.9716,  longitude: 77.5946   },
  HYD: { latitude: 17.3850,  longitude: 78.4867   },
  CCU: { latitude: 22.5726,  longitude: 88.3639   },
  GOI: { latitude: 15.2993,  longitude: 74.1240   },
  CMB: { latitude: 6.9271,   longitude: 79.8612   },
  DAC: { latitude: 23.8103,  longitude: 90.4125   },
  KTM: { latitude: 27.7172,  longitude: 85.3240   },
  KHI: { latitude: 24.8607,  longitude: 67.0011   },
  LHE: { latitude: 31.5497,  longitude: 74.3436   },
  MLE: { latitude: 4.1755,   longitude: 73.5093   },
  // Asia – Central
  ALA: { latitude: 43.2220,  longitude: 76.8512   },
  TAS: { latitude: 41.2995,  longitude: 69.2401   },
  // Oceania
  SYD: { latitude: -33.8688, longitude: 151.2093  },
  MEL: { latitude: -37.8136, longitude: 144.9631  },
  BNE: { latitude: -27.4698, longitude: 153.0251  },
  PER: { latitude: -31.9505, longitude: 115.8605  },
  ADL: { latitude: -34.9285, longitude: 138.6007  },
  CBR: { latitude: -35.2809, longitude: 149.1300  },
  CNS: { latitude: -16.9186, longitude: 145.7781  },
  OOL: { latitude: -28.0167, longitude: 153.4000  },
  AKL: { latitude: -36.8485, longitude: 174.7633  },
  CHC: { latitude: -43.5321, longitude: 172.6362  },
  WLG: { latitude: -41.2865, longitude: 174.7762  },
  NAN: { latitude: -17.7765, longitude: 178.4500  },
  PPT: { latitude: -17.5516, longitude: -149.5584 },
  NOU: { latitude: -22.2758, longitude: 166.4580  },
  // France – overseas
  MQP: { latitude: 25.3817,  longitude: 57.3657   },
  RUN: { latitude: -20.8823, longitude: 55.4504   },
  PTP: { latitude: 16.2650,  longitude: -61.5318  },
  FDF: { latitude: 14.6015,  longitude: -61.0893  },
};

async function getAmadeusToken(clientId: string, clientSecret: string): Promise<string> {
  const resp = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Amadeus auth failed: ${err}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function resolveCoordinates(
  iataCode: string,
  token: string
): Promise<{ latitude: number; longitude: number }> {
  const code = iataCode.toUpperCase();

  if (AIRPORT_COORDS[code]) {
    console.log(`Using hardcoded coords for ${code}`);
    return AIRPORT_COORDS[code];
  }

  console.log(`Resolving coords for ${code} via Amadeus locations API...`);
  const url = new URL(`${AMADEUS_BASE}/v1/reference-data/locations`);
  url.searchParams.set("keyword", code);
  url.searchParams.set("subType", "AIRPORT");

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    throw new Error(`Location lookup failed for ${code}: ${await resp.text()}`);
  }

  const data = await resp.json();
  const geo = data.data?.[0]?.geoCode;

  if (!geo?.latitude || !geo?.longitude) {
    throw new Error(`No coordinates found for airport ${code}. Add it to AIRPORT_COORDS.`);
  }

  return { latitude: geo.latitude, longitude: geo.longitude };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("AMADEUS_CLIENT_ID");
    const clientSecret = Deno.env.get("AMADEUS_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET must be configured in Supabase secrets");
    }

    let destination = "CDG";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        console.log("Received activities search params:", JSON.stringify(body));
        if (body.destination) destination = body.destination.toUpperCase();
      } catch {
        console.log("No body or invalid JSON, using default destination");
      }
    }

    console.log(`Activities search for: ${destination}`);

    const token = await getAmadeusToken(clientId, clientSecret);

    let coords: { latitude: number; longitude: number };
    try {
      coords = await resolveCoordinates(destination, token);
      console.log(`Resolved ${destination} → lat:${coords.latitude} lon:${coords.longitude}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Coordinate resolution failed:", msg);
      return new Response(
        JSON.stringify({ error: `Could not resolve destination: ${msg}`, activities: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const activitiesUrl = new URL(`${AMADEUS_BASE}/v1/shopping/activities`);
    activitiesUrl.searchParams.set("latitude", String(coords.latitude));
    activitiesUrl.searchParams.set("longitude", String(coords.longitude));
    activitiesUrl.searchParams.set("radius", "20");

    const activitiesResp = await fetch(activitiesUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!activitiesResp.ok) {
      const errText = await activitiesResp.text();
      console.error(`Activities search error [${activitiesResp.status}]: ${errText}`);
      return new Response(
        JSON.stringify({ error: `Activities search failed (${activitiesResp.status})`, activities: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const activitiesData = await activitiesResp.json();
    console.log(`Received ${activitiesData.data?.length ?? 0} activities from Amadeus`);

    const activities: ActivityOffer[] = (activitiesData.data || []).map((a: any) => ({
      id: a.id ?? crypto.randomUUID(),
      name: a.name ?? "Unknown Activity",
      short_description: a.shortDescription ?? null,
      rating: a.rating ?? null,
      price_amount: a.price?.amount ?? null,
      price_currency: a.price?.currencyCode ?? null,
      picture_url: a.pictures?.[0] ?? null,
      booking_link: a.bookingLink ?? null,
      categories: a.subType ? [a.subType] : [],
      is_free: false,
    }));

    // Sort by rating descending (nulls last), return top 6
    activities.sort((a, b) => {
      const ra = a.rating ? parseFloat(a.rating) : -1;
      const rb = b.rating ? parseFloat(b.rating) : -1;
      return rb - ra;
    });
    const topActivities = activities.slice(0, 6);

    console.log(`Returning top ${topActivities.length} activities`);

    return new Response(
      JSON.stringify({ destination, activities: topActivities }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in search_activities_amadeus:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg, activities: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
