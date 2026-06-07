export type LayerType = "price" | "crime" | "hazard";

export interface PriceData {
  avgPricePerSqm: number;
  medianPricePerSqm: number;
  transactionCount: number;
  trend: string;
}

export interface SafetyData {
  crimeCount: number;
  crimeRatePer10k: number;
  score: number;
  rankInPrefecture: string;
}

export interface DisasterData {
  floodRiskLevel: number;
  landslideRisk: boolean;
  tsunamiRisk: boolean;
  earthquakeProb30y: number;
  score: number;
}

export interface AreaScore {
  cityCode: string;
  cityName: string;
  overallScore: number;
  priceData: PriceData;
  safetyData: SafetyData;
  disasterData: DisasterData;
  nearbyAreas?: { cityCode: string; cityName: string; overallScore: number }[];
}

export interface MapFeatureProperties {
  // price layer (individual transactions)
  price_per_sqm?: number;
  property_type?: string;
  transaction_date?: string;
  nearest_station?: string;
  walk_minutes?: number;
  // choropleth layer (ward/city averages)
  avg_price_per_sqm?: number;
  avg_price_per_tsubo?: number;
  median_price_per_sqm?: number;
  transaction_count?: number;
  prefecture?: string;
  municipality?: string;
  // crime layer
  crime_type?: string;
  occurred_date?: string;
  // hazard layer
  city_code?: string;
  city_name?: string;
  flood_risk_level?: number;
  landslide_risk?: boolean;
  overall_score?: number;
}
