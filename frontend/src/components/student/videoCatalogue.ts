export interface TrainingVideo {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  thumbnailUrl: string;
  description: string;
}

export interface VideoExercise {
  exerciseId: string;
  exerciseName: string;
  category: string;
  videos: TrainingVideo[];
}

export interface VideoPick extends TrainingVideo {
  exerciseId: string;
  exerciseName: string;
  category: string;
}

export const VIDEO_CATALOGUE: VideoExercise[] = [
  {
    exerciseId: "stalls",
    exerciseName: "Stalls and Stall Recognition",
    category: "Aircraft and Flight Fundamentals",
    videos: [
      {
        videoId: "vsZogmpeykc",
        title: "Day 18: Perfecting The Power On Stall Recovery",
        channel: "MzeroA Flight Training",
        url: "https://www.youtube.com/watch?v=vsZogmpeykc",
        thumbnailUrl: "https://i.ytimg.com/vi/vsZogmpeykc/hqdefault.jpg",
        description: "MzeroA demonstrates power-on stall setup, recognition cues and recovery technique.",
      },
      {
        videoId: "W8f--JaGq5A",
        title: "Private Pilot Flight Training Exercise 12 - Stalls pt 1 Power Off",
        channel: "Flight Instruction 101",
        url: "https://www.youtube.com/watch?v=W8f--JaGq5A",
        thumbnailUrl: "https://i.ytimg.com/vi/W8f--JaGq5A/hqdefault.jpg",
        description: "A flight lesson covering power-off stalls, recognition and recovery.",
      },
    ],
  },
  {
    exerciseId: "weight-balance",
    exerciseName: "Aircraft Weight and Balance",
    category: "Performance and Limitations",
    videos: [
      {
        videoId: "ix_BShDvvts",
        title: "The Complete Guide to Weight and Balance (PPL Lesson 50)",
        channel: "Free Pilot Training",
        url: "https://www.youtube.com/watch?v=ix_BShDvvts",
        thumbnailUrl: "https://i.ytimg.com/vi/ix_BShDvvts/hqdefault.jpg",
        description: "A complete weight-and-balance lesson covering the calculations and limits for PPL planning.",
      },
      {
        videoId: "Bo2ydJq9F-c",
        title: "Calculating Weight and Balance - MzeroA Flight Training",
        channel: "MzeroA Flight Training",
        url: "https://www.youtube.com/watch?v=Bo2ydJq9F-c",
        thumbnailUrl: "https://i.ytimg.com/vi/Bo2ydJq9F-c/hqdefault.jpg",
        description: "MzeroA walks through completing a weight-and-balance form.",
      },
    ],
  },
  {
    exerciseId: "density-alt",
    exerciseName: "Density Altitude",
    category: "Performance and Limitations",
    videos: [
      {
        videoId: "Y1FQf3tM6pk",
        title: "PPGS Lesson 9.1 | Performance: Density Altitude & the 3 Hs",
        channel: "Epic Flight Academy",
        url: "https://www.youtube.com/watch?v=Y1FQf3tM6pk",
        thumbnailUrl: "https://i.ytimg.com/vi/Y1FQf3tM6pk/hqdefault.jpg",
        description: "Epic Flight Academy explains density altitude and the three Hs.",
      },
      {
        videoId: "BfsY7dBb1T4",
        title: "PPGS Lesson 9.2 | Performance: Density Altitude Charts",
        channel: "Epic Flight Academy",
        url: "https://www.youtube.com/watch?v=BfsY7dBb1T4",
        thumbnailUrl: "https://i.ytimg.com/vi/BfsY7dBb1T4/hqdefault.jpg",
        description: "A follow-up lesson on reading density-altitude performance charts.",
      },
    ],
  },
  {
    exerciseId: "wind",
    exerciseName: "Wind and Wind Effects",
    category: "Meteorology",
    videos: [
      {
        videoId: "gnGxGH1tpSI",
        title: "Crosswind Landings Explained | Epic Flight Academy",
        channel: "Epic Flight Academy",
        url: "https://www.youtube.com/watch?v=gnGxGH1tpSI",
        thumbnailUrl: "https://i.ytimg.com/vi/gnGxGH1tpSI/hqdefault.jpg",
        description: "Epic Flight Academy breaks down crosswind landings and why wind correction matters.",
      },
      {
        videoId: "tPiBZMRxU3o",
        title: "How to Taxi in Strong Winds (PPL Ground Lesson 63)",
        channel: "Free Pilot Training",
        url: "https://www.youtube.com/watch?v=tPiBZMRxU3o",
        thumbnailUrl: "https://i.ytimg.com/vi/tPiBZMRxU3o/hqdefault.jpg",
        description: "Free Pilot Training shows correct control positions for taxiing in strong winds.",
      },
    ],
  },
  {
    exerciseId: "radio-principles",
    exerciseName: "Radio Communication Principles",
    category: "Air Law and Operational Knowledge",
    videos: [
      {
        videoId: "wRb1ouinUPY",
        title: "Private Pilot Licence Flight Exercise 30 - Radio Communications; the basics",
        channel: "Flight Instruction 101",
        url: "https://www.youtube.com/watch?v=wRb1ouinUPY",
        thumbnailUrl: "https://i.ytimg.com/vi/wRb1ouinUPY/hqdefault.jpg",
        description: "The basics of radio communication procedures for private-pilot flight exercises.",
      },
      {
        videoId: "qNhVk75ceeY",
        title: "A Lesson In Radio Communications - MzeroA Flight Training",
        channel: "MzeroA Flight Training",
        url: "https://www.youtube.com/watch?v=qNhVk75ceeY",
        thumbnailUrl: "https://i.ytimg.com/vi/qNhVk75ceeY/hqdefault.jpg",
        description: "MzeroA covers Class D departure and VFR radio communication flows.",
      },
    ],
  },
  {
    exerciseId: "threat-error",
    exerciseName: "Threat and Error Management",
    category: "Human Performance",
    videos: [
      {
        videoId: "cb7E7kjHGYw",
        title: "Introduction to Threat & Error Management - How to use it to be a safer pilot!",
        channel: "AB Helicopters Ltd",
        url: "https://www.youtube.com/watch?v=cb7E7kjHGYw",
        thumbnailUrl: "https://i.ytimg.com/vi/cb7E7kjHGYw/hqdefault.jpg",
        description: "An introduction to Threat and Error Management principles in aviation.",
      },
      {
        videoId: "FYoCadwQXgs",
        title: "THREAT and ERROR management for general aviation pilots",
        channel: "Nathan Ballard",
        url: "https://www.youtube.com/watch?v=FYoCadwQXgs",
        thumbnailUrl: "https://i.ytimg.com/vi/FYoCadwQXgs/hqdefault.jpg",
        description: "How general-aviation pilots can apply airline-style TEM strategies.",
      },
    ],
  },
  {
    exerciseId: "tol-perf",
    exerciseName: "Take-off and Landing Performance",
    category: "Performance and Limitations",
    videos: [
      {
        videoId: "8rQwbdmPgIg",
        title: "How to Read Takeoff & Landing Performance Charts using ForeFlight",
        channel: "FalconImagery Flight Training",
        url: "https://www.youtube.com/watch?v=8rQwbdmPgIg",
        thumbnailUrl: "https://i.ytimg.com/vi/8rQwbdmPgIg/hqdefault.jpg",
        description: "How to read take-off and landing performance charts using ForeFlight.",
      },
      {
        videoId: "2VCV7H2rPEM",
        title: "Full Flight Lesson from Private Pilot Training",
        channel: "Thrust Flight",
        url: "https://www.youtube.com/watch?v=2VCV7H2rPEM",
        thumbnailUrl: "https://i.ytimg.com/vi/2VCV7H2rPEM/hqdefault.jpg",
        description: "A full lesson covering soft-field take-offs and landings in private-pilot training.",
      },
    ],
  },
  {
    exerciseId: "nav-aids",
    exerciseName: "Navigation Aids",
    category: "Navigation and Flight Planning",
    videos: [
      {
        videoId: "agTrPyRoIxg",
        title: "VOR Navigation Made Simple for Private Pilots",
        channel: "Edward Haley",
        url: "https://www.youtube.com/watch?v=agTrPyRoIxg",
        thumbnailUrl: "https://i.ytimg.com/vi/agTrPyRoIxg/hqdefault.jpg",
        description: "A step-by-step VOR navigation lesson for private pilots.",
      },
      {
        videoId: "cXFpjwTEyTY",
        title: "Master VOR Navigation in Minutes! In-Flight Tutorial | IFR Pilot & Aviation Training",
        channel: "Evan Luft",
        url: "https://www.youtube.com/watch?v=cXFpjwTEyTY",
        thumbnailUrl: "https://i.ytimg.com/vi/cXFpjwTEyTY/hqdefault.jpg",
        description: "An in-flight VOR navigation tutorial.",
      },
    ],
  },
  {
    exerciseId: "aerodrome-ops",
    exerciseName: "Aerodrome Operations",
    category: "Air Law and Operational Knowledge",
    videos: [
      {
        videoId: "pnAT7ROW5Fk",
        title: "Private Pilot Tutorial 13: Airport Operations (Part 2 of 3)",
        channel: "Pilot Training System",
        url: "https://www.youtube.com/watch?v=pnAT7ROW5Fk",
        thumbnailUrl: "https://i.ytimg.com/vi/pnAT7ROW5Fk/hqdefault.jpg",
        description: "An airport-operations tutorial covering how aerodromes are organised for pilots.",
      },
    ],
  },
  {
    exerciseId: "spatial-disorientation",
    exerciseName: "Spatial Disorientation",
    category: "Human Performance",
    videos: [
      {
        videoId: "6BD9fyyIJzY",
        title: "Spatial Disorientation Explained: Deadly Flight Illusions Every Pilot Must Know",
        channel: "Epic Flight Academy",
        url: "https://www.youtube.com/watch?v=6BD9fyyIJzY",
        thumbnailUrl: "https://i.ytimg.com/vi/6BD9fyyIJzY/hqdefault.jpg",
        description: "Epic Flight Academy explains spatial disorientation and flight illusions.",
      },
      {
        videoId: "ao1UKSS90I8",
        title: "The Best Way To Practice Spatial Disorientation - SPC Day 11",
        channel: "MzeroA Flight Training",
        url: "https://www.youtube.com/watch?v=ao1UKSS90I8",
        thumbnailUrl: "https://i.ytimg.com/vi/ao1UKSS90I8/hqdefault.jpg",
        description: "MzeroA demonstrates an exercise for practising spatial-disorientation awareness.",
      },
    ],
  },
  {
    exerciseId: "engine",
    exerciseName: "Engine and Propulsion",
    category: "Aircraft Systems",
    videos: [
      {
        videoId: "SvmJa6twZY8",
        title: "Private Pilot Tutorial 6: Aircraft Systems (Part 2 of 2)",
        channel: "Pilot Training System",
        url: "https://www.youtube.com/watch?v=SvmJa6twZY8",
        thumbnailUrl: "https://i.ytimg.com/vi/SvmJa6twZY8/hqdefault.jpg",
        description: "Pilot Training System explains how major aircraft systems operate.",
      },
    ],
  },
  {
    exerciseId: "principles",
    exerciseName: "Principles of Flight",
    category: "Aircraft and Flight Fundamentals",
    videos: [
      {
        videoId: "jt4ga4NNbic",
        title: "Private Pilot Tutorial 3: Principles of Flight",
        channel: "Pilot Training System",
        url: "https://www.youtube.com/watch?v=jt4ga4NNbic",
        thumbnailUrl: "https://i.ytimg.com/vi/jt4ga4NNbic/hqdefault.jpg",
        description: "An introduction to the four forces and principles of flight.",
      },
    ],
  },
  {
    exerciseId: "hypoxia",
    exerciseName: "Hypoxia",
    category: "Human Performance",
    videos: [
      {
        videoId: "gAuXV2XtCnU",
        title: "Flying and Hypoxia",
        channel: "FAASTeam - Safety Videos Archive -Unofficial-",
        url: "https://www.youtube.com/watch?v=gAuXV2XtCnU",
        thumbnailUrl: "https://i.ytimg.com/vi/gAuXV2XtCnU/hqdefault.jpg",
        description: "A safety video on hypoxia causes, symptoms and in-flight response.",
      },
      {
        videoId: "pBLt9dSpBDk",
        title: "Causes and Effects of Hypoxia - AeroGuard Flight Training Center",
        channel: "AeroGuard Flight Training Center",
        url: "https://www.youtube.com/watch?v=pBLt9dSpBDk",
        thumbnailUrl: "https://i.ytimg.com/vi/pBLt9dSpBDk/hqdefault.jpg",
        description: "AeroGuard explains hypoxia types, causes and effects.",
      },
    ],
  },
  {
    exerciseId: "weather-reports",
    exerciseName: "Weather Reports and Forecasts",
    category: "Meteorology",
    videos: [
      {
        videoId: "BTMLP9lOQz8",
        title: "PPL Checkride Prep: Mastering Weather | Flying New Guy",
        channel: "Pilot Institute Airplanes",
        url: "https://www.youtube.com/watch?v=BTMLP9lOQz8",
        thumbnailUrl: "https://i.ytimg.com/vi/BTMLP9lOQz8/hqdefault.jpg",
        description: "Pilot Institute reviews aviation weather reports for checkride preparation.",
      },
      {
        videoId: "y5RWx_ypniY",
        title: "The ACCURATE Weather Forecast....",
        channel: "FLY8MA.com Flight Training",
        url: "https://www.youtube.com/watch?v=y5RWx_ypniY",
        thumbnailUrl: "https://i.ytimg.com/vi/y5RWx_ypniY/hqdefault.jpg",
        description: "FLY8MA explains how to interpret aviation weather forecasts.",
      },
    ],
  },
];

export const VIDEO_PICKS: VideoPick[] = VIDEO_CATALOGUE.flatMap((exercise) =>
  exercise.videos.map((video) => ({
    ...video,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    category: exercise.category,
  })),
);

export function pickRandomVideo(excludeVideoId: string | null): VideoPick {
  const candidates = excludeVideoId
    ? VIDEO_PICKS.filter((video) => video.videoId !== excludeVideoId)
    : VIDEO_PICKS;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? VIDEO_PICKS[0];
}
