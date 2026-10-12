export interface Exercise {
  id: string;
  name: string;
  category: string;
}

export interface ExerciseCategory {
  id: string;
  name: string;
  iconPath: string;
  exercises: Exercise[];
}

export const TECHNICAL_CATEGORIES: ExerciseCategory[] = [
  {
    id: "aircraft-fundamentals",
    name: "Aircraft and Flight Fundamentals",
    iconPath: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
    exercises: [
      { id: "axes", name: "Aircraft Axes and Movements", category: "Aircraft and Flight Fundamentals" },
      { id: "controls", name: "Primary and Secondary Flight Controls", category: "Aircraft and Flight Fundamentals" },
      { id: "lift", name: "Lift, Weight, Thrust, and Drag", category: "Aircraft and Flight Fundamentals" },
      { id: "principles", name: "Principles of Flight", category: "Aircraft and Flight Fundamentals" },
      { id: "stability", name: "Stability and Control", category: "Aircraft and Flight Fundamentals" },
      { id: "aoa", name: "Angle of Attack", category: "Aircraft and Flight Fundamentals" },
      { id: "load-factor", name: "Load Factor", category: "Aircraft and Flight Fundamentals" },
      { id: "stalls", name: "Stalls and Stall Recognition", category: "Aircraft and Flight Fundamentals" },
      { id: "trim", name: "Aircraft Trim", category: "Aircraft and Flight Fundamentals" },
    ],
  },
  {
    id: "aircraft-systems",
    name: "Aircraft Systems",
    iconPath: "M12 2v20 M2 12h20 M4.93 4.93l14.14 14.14 M19.07 4.93 4.93 19.07",
    exercises: [
      { id: "engine", name: "Engine and Propulsion", category: "Aircraft Systems" },
      { id: "fuel-sys", name: "Fuel Systems", category: "Aircraft Systems" },
      { id: "electrical", name: "Electrical Systems", category: "Aircraft Systems" },
      { id: "instruments", name: "Flight Instruments", category: "Aircraft Systems" },
      { id: "pitot-static", name: "Pitot-Static System", category: "Aircraft Systems" },
      { id: "vacuum", name: "Vacuum Systems", category: "Aircraft Systems" },
      { id: "gear", name: "Landing Gear", category: "Aircraft Systems" },
      { id: "flaps", name: "Flaps and High-Lift Devices", category: "Aircraft Systems" },
      { id: "carb-heat", name: "Carburettor Heat", category: "Aircraft Systems" },
    ],
  },
  {
    id: "performance",
    name: "Performance and Limitations",
    iconPath: "M12 2v20 M12 6l6 6-6 6",
    exercises: [
      { id: "weight-balance", name: "Aircraft Weight and Balance", category: "Performance and Limitations" },
      { id: "cg", name: "Centre of Gravity", category: "Performance and Limitations" },
      { id: "tol-perf", name: "Take-off and Landing Performance", category: "Performance and Limitations" },
      { id: "climb-perf", name: "Climb Performance", category: "Performance and Limitations" },
      { id: "density-alt", name: "Density Altitude", category: "Performance and Limitations" },
      { id: "perf-charts", name: "Performance Charts", category: "Performance and Limitations" },
      { id: "limitations", name: "Aircraft Operating Limitations", category: "Performance and Limitations" },
    ],
  },
  {
    id: "meteorology",
    name: "Meteorology",
    iconPath: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
    exercises: [
      { id: "atmosphere", name: "Atmosphere and Pressure", category: "Meteorology" },
      { id: "temp-density", name: "Temperature and Density", category: "Meteorology" },
      { id: "wind", name: "Wind and Wind Effects", category: "Meteorology" },
      { id: "clouds", name: "Clouds and Visibility", category: "Meteorology" },
      { id: "fog", name: "Fog and Precipitation", category: "Meteorology" },
      { id: "thunderstorms", name: "Thunderstorms", category: "Meteorology" },
      { id: "turbulence", name: "Turbulence", category: "Meteorology" },
      { id: "icing", name: "Icing", category: "Meteorology" },
      { id: "weather-reports", name: "Weather Reports and Forecasts", category: "Meteorology" },
    ],
  },
  {
    id: "navigation",
    name: "Navigation and Flight Planning",
    iconPath: "M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z",
    exercises: [
      { id: "charts", name: "Charts and Symbols", category: "Navigation and Flight Planning" },
      { id: "headings", name: "Headings and Tracks", category: "Navigation and Flight Planning" },
      { id: "variation", name: "Variation and Deviation", category: "Navigation and Flight Planning" },
      { id: "wind-correction", name: "Wind Correction", category: "Navigation and Flight Planning" },
      { id: "groundspeed", name: "Groundspeed and Estimated Time", category: "Navigation and Flight Planning" },
      { id: "flight-planning", name: "Flight Planning", category: "Navigation and Flight Planning" },
      { id: "nav-aids", name: "Navigation Aids", category: "Navigation and Flight Planning" },
      { id: "airspace-nav", name: "Airspace Awareness", category: "Navigation and Flight Planning" },
    ],
  },
  {
    id: "air-law",
    name: "Air Law and Operational Knowledge",
    iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
    exercises: [
      { id: "vfr-principles", name: "VFR Principles", category: "Air Law and Operational Knowledge" },
      { id: "rules-air", name: "Rules of the Air", category: "Air Law and Operational Knowledge" },
      { id: "airspace-class", name: "Airspace Classifications", category: "Air Law and Operational Knowledge" },
      { id: "right-of-way", name: "Right-of-Way Rules", category: "Air Law and Operational Knowledge" },
      { id: "aerodrome-ops", name: "Aerodrome Operations", category: "Air Law and Operational Knowledge" },
      { id: "radio-principles", name: "Radio Communication Principles", category: "Air Law and Operational Knowledge" },
      { id: "notams-law", name: "NOTAMs and Operational Information", category: "Air Law and Operational Knowledge" },
    ],
  },
  {
    id: "abnormal-emergency",
    name: "Abnormal and Emergency Theory",
    iconPath: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
    exercises: [
      { id: "abnormal-recognition", name: "Recognition of Abnormal Situations", category: "Abnormal and Emergency Theory" },
      { id: "engine-fail-theory", name: "Engine-System Failures", category: "Abnormal and Emergency Theory" },
      { id: "electrical-fail-theory", name: "Electrical-System Failures", category: "Abnormal and Emergency Theory" },
      { id: "instrument-abnormal", name: "Instrument Abnormalities", category: "Abnormal and Emergency Theory" },
      { id: "decision-making", name: "Decision-Making and Prioritization", category: "Abnormal and Emergency Theory" },
      { id: "human-factors-emergency", name: "Human Factors and Situational Awareness", category: "Abnormal and Emergency Theory" },
    ],
  },
  {
    id: "human-performance",
    name: "Human Performance",
    iconPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    exercises: [
      { id: "hypoxia", name: "Hypoxia", category: "Human Performance" },
      { id: "spatial-disorientation", name: "Spatial Disorientation", category: "Human Performance" },
      { id: "fatigue", name: "Fatigue and Stress", category: "Human Performance" },
      { id: "vision-illusions", name: "Vision and Illusions", category: "Human Performance" },
      { id: "workload", name: "Workload Management", category: "Human Performance" },
      { id: "threat-error", name: "Threat and Error Management", category: "Human Performance" },
      { id: "adm", name: "Aeronautical Decision-Making", category: "Human Performance" },
    ],
  },
];

export const ALL_EXERCISES: Exercise[] = TECHNICAL_CATEGORIES.flatMap((c) => c.exercises);

export function searchExercises(query: string, custom: Exercise[] = []): Exercise[] {
  const all = [...ALL_EXERCISES, ...custom];
  const q = query.toLowerCase().trim();
  if (!q) return all;
  return all.filter((e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
}
