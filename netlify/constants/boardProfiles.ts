/**
 * Exam board profiles for MCQ generation.
 * Maps board/level to assessment objectives, command words, and conventions.
 */

export type AOLevel = 'AO1' | 'AO2' | 'AO3';

export interface BoardProfile {
  board: string;
  level?: string; // A-level, AS, IGCSE, IB DP, etc.
  aoMapping: {
    AO1: string; // e.g., "Knowledge & understanding"
    AO2: string; // e.g., "Application & problem solving"
    AO3?: string; // e.g., "Analysis & evaluation" (optional for some boards)
  };
  commandWords: {
    AO1: string[]; // Recall/definition commands
    AO2: string[]; // Application/calculation commands
    AO3?: string[]; // Analysis/evaluation commands
  };
  conventions: {
    sigFigs?: number; // Default significant figures
    gValue?: string; // Gravity constant convention (e.g., "9.8" or "9.81")
    units?: string; // SI preferred, etc.
    distractorStyle?: string; // Common patterns
  };
  notes?: string;
}

export const BOARD_PROFILES: Record<string, BoardProfile> = {
  AQA_A_LEVEL: {
    board: 'AQA',
    level: 'A-level',
    aoMapping: {
      AO1: 'Demonstrate knowledge and understanding',
      AO2: 'Apply knowledge and understanding',
      AO3: 'Analyse, interpret and evaluate scientific information',
    },
    commandWords: {
      AO1: ['state', 'define', 'recall', 'name', 'identify'],
      AO2: ['describe', 'explain', 'calculate', 'derive', 'determine'],
      AO3: ['evaluate', 'assess', 'discuss', 'suggest', 'justify'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI preferred',
      distractorStyle: 'Common calculation errors, wrong formula applications',
    },
    notes: 'Quality of written communication valued; typical calc marks 3–6.',
  },
  EDEXCEL_A_LEVEL: {
    board: 'Edexcel',
    level: 'A-level',
    aoMapping: {
      AO1: 'Demonstrate knowledge and understanding',
      AO2: 'Apply knowledge and understanding',
      AO3: 'Analyse, interpret and evaluate',
    },
    commandWords: {
      AO1: ['state', 'define', 'name', 'identify'],
      AO2: ['explain', 'calculate', 'show that', 'derive', 'determine'],
      AO3: ['assess', 'evaluate', 'comment on significance', 'discuss'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI',
      distractorStyle: 'Multi-step clarity errors, unit mismatches',
    },
    notes: 'Strong emphasis on multi-step calculation clarity.',
  },
  OCR_A_A_LEVEL: {
    board: 'OCR A',
    level: 'A-level',
    aoMapping: {
      AO1: 'Demonstrate knowledge and understanding',
      AO2: 'Apply knowledge and understanding',
      AO3: 'Analyse, interpret and evaluate',
    },
    commandWords: {
      AO1: ['state', 'define', 'name'],
      AO2: ['suggest', 'explain', 'calculate', 'determine', 'state and explain'],
      AO3: ['evaluate', 'discuss', 'assess'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI',
      distractorStyle: 'Diagram interpretation errors, reasoning gaps',
    },
    notes: 'Frequent "suggest/state and explain" pairs; diagrams commonly credited.',
  },
  OCR_B_A_LEVEL: {
    board: 'OCR B (Advancing Physics)',
    level: 'A-level',
    aoMapping: {
      AO1: 'Demonstrate knowledge and understanding',
      AO2: 'Apply knowledge to real contexts',
      AO3: 'Analyse, interpret and evaluate',
    },
    commandWords: {
      AO1: ['state', 'define', 'recall'],
      AO2: ['explain in context', 'apply', 'estimate', 'model'],
      AO3: ['evaluate', 'assess significance', 'discuss limitations'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI',
      distractorStyle: 'Context mismatches, reasoning chain breaks',
    },
    notes: 'Context-led; application-heavy AO2; expects reasoning chains tied to real scenarios.',
  },
  CIE_9702: {
    board: 'CIE (Cambridge)',
    level: 'A-level',
    aoMapping: {
      AO1: 'Knowledge and understanding',
      AO2: 'Handling, applying and evaluating information',
      AO3: 'Experimental skills and investigations',
    },
    commandWords: {
      AO1: ['state', 'define', 'describe'],
      AO2: ['explain', 'calculate', 'determine', 'deduce', 'predict'],
      AO3: ['suggest', 'evaluate', 'discuss'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI',
      distractorStyle: 'Unit errors, sig fig violations, data interpretation failures',
    },
    notes: 'Frequent data/units/sig-fig checks; experimental design questions.',
  },
  WJEC_A_LEVEL: {
    board: 'WJEC',
    level: 'A-level',
    aoMapping: {
      AO1: 'Demonstrate knowledge and understanding',
      AO2: 'Apply knowledge and understanding',
      AO3: 'Analyse, interpret and evaluate',
    },
    commandWords: {
      AO1: ['state', 'define', 'name', 'identify'],
      AO2: ['describe', 'explain', 'calculate', 'show'],
      AO3: ['evaluate', 'assess', 'discuss', 'justify'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI',
      distractorStyle: 'Similar to AQA; QWC cues',
    },
    notes: 'Similar AO split to AQA; explicit quality of written communication cues.',
  },
  IB_DP: {
    board: 'IB DP',
    level: 'HL/SL',
    aoMapping: {
      AO1: 'Knowledge and understanding',
      AO2: 'Application and analysis',
      AO3: 'Synthesis and evaluation',
    },
    commandWords: {
      AO1: ['define', 'state', 'outline', 'list'],
      AO2: ['explain', 'apply', 'analyse', 'derive', 'calculate'],
      AO3: ['evaluate', 'discuss', 'compare and contrast', 'to what extent'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI',
      distractorStyle: 'Reasoning gaps, missing assumptions, incomplete justifications',
    },
    notes: 'Command terms strictly defined; markbands reward reasoning and assumptions.',
  },
  GENERIC: {
    board: 'Generic',
    aoMapping: {
      AO1: 'Recall and understanding',
      AO2: 'Application and problem solving',
      AO3: 'Analysis and evaluation',
    },
    commandWords: {
      AO1: ['state', 'define', 'identify'],
      AO2: ['explain', 'calculate', 'determine'],
      AO3: ['evaluate', 'assess', 'discuss'],
    },
    conventions: {
      sigFigs: 3,
      gValue: '9.81',
      units: 'SI',
      distractorStyle: 'Common errors, formula misapplication',
    },
    notes: 'Fallback when no specific board is provided.',
  },
};

/**
 * Resolve board profile from syllabus and level inputs.
 * Returns the best match or GENERIC fallback.
 */
export function resolveBoardProfile(syllabus?: string, level?: string): BoardProfile {
  const syl = (syllabus || '').trim().toLowerCase();
  const lev = (level || '').trim().toLowerCase();

  // Direct matches
  if (syl.includes('aqa') && lev.includes('a-level')) return BOARD_PROFILES.AQA_A_LEVEL;
  if (syl.includes('edexcel') && lev.includes('a-level')) return BOARD_PROFILES.EDEXCEL_A_LEVEL;
  if (syl.includes('ocr a') && lev.includes('a-level')) return BOARD_PROFILES.OCR_A_A_LEVEL;
  if (syl.includes('ocr b') && lev.includes('a-level')) return BOARD_PROFILES.OCR_B_A_LEVEL;
  if ((syl.includes('cie') || syl.includes('cambridge')) && lev.includes('a-level')) return BOARD_PROFILES.CIE_9702;
  if (syl.includes('wjec') && lev.includes('a-level')) return BOARD_PROFILES.WJEC_A_LEVEL;
  if (syl.includes('ib') || lev.includes('ib')) return BOARD_PROFILES.IB_DP;

  // Partial matches
  if (syl.includes('aqa')) return BOARD_PROFILES.AQA_A_LEVEL;
  if (syl.includes('edexcel')) return BOARD_PROFILES.EDEXCEL_A_LEVEL;
  if (syl.includes('ocr')) return BOARD_PROFILES.OCR_A_A_LEVEL;
  if (syl.includes('cie') || syl.includes('cambridge')) return BOARD_PROFILES.CIE_9702;
  if (syl.includes('wjec')) return BOARD_PROFILES.WJEC_A_LEVEL;
  if (syl.includes('ib')) return BOARD_PROFILES.IB_DP;

  return BOARD_PROFILES.GENERIC;
}

/**
 * Build AO distribution guidance for a given mark count.
 * Returns a string describing ideal AO allocation.
 */
export function buildAODistribution(marks: number, profile: BoardProfile): string {
  if (marks <= 2) {
    return 'Distribute: primarily AO1 recall, with one AO2 if marks ≥ 2.';
  }
  if (marks <= 4) {
    return 'Distribute: at least 1 AO1, 1–2 AO2, 1 AO3 if marks ≥ 4.';
  }
  if (marks <= 6) {
    return 'Distribute: 1–2 AO1, 2–3 AO2, 1–2 AO3. Majority should be AO2 application.';
  }
  return 'Distribute: 1–2 AO1 (early steps), 3–4 AO2 (mid steps), 2–3 AO3 (later steps). Ensure progression from recall → application → evaluation.';
}

/**
 * Format command words for prompt injection.
 */
export function formatCommandWords(profile: BoardProfile): string {
  const ao1 = profile.commandWords.AO1.join(', ');
  const ao2 = profile.commandWords.AO2.join(', ');
  const ao3 = profile.commandWords.AO3?.join(', ') || 'evaluate, discuss';
  return `AO1 (${profile.aoMapping.AO1}): ${ao1}
AO2 (${profile.aoMapping.AO2}): ${ao2}
AO3 (${profile.aoMapping.AO3 || 'Analysis & evaluation'}): ${ao3}`;
}

/**
 * Build board-specific conventions string for prompts.
 */
export function formatConventions(profile: BoardProfile): string {
  const parts: string[] = [];
  if (profile.conventions.sigFigs) parts.push(`${profile.conventions.sigFigs} sig figs`);
  if (profile.conventions.gValue) parts.push(`g = ${profile.conventions.gValue} m/s²`);
  if (profile.conventions.units) parts.push(profile.conventions.units);
  if (profile.conventions.distractorStyle) parts.push(`Distractors: ${profile.conventions.distractorStyle}`);
  return parts.join('; ');
}
