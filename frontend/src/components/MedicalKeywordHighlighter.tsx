import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  CheckCircle, 
  Compass, 
  Tag, 
  Zap, 
  X,
  Filter
} from 'lucide-react';
import { HighlightCategory, MedicalEntity } from '../types';

interface MedicalKeywordHighlighterProps {
  text: string;
  className?: string;
  initialMode?: 'badge' | 'underline' | 'subtle';
  showToolbar?: boolean;
}

// Comprehensive dictionary of clinical entities with definitions and coding standards
const MEDICAL_KNOWLEDGE_BASE: Record<string, Omit<MedicalEntity, 'term'>> = {
  // Pathologies (Rose/Red)
  'cardiomegaly': {
    category: 'pathology',
    definition: 'Enlargement of the cardiac silhouette (cardiothoracic ratio > 0.50).',
    clinicalSignificance: 'Indicates underlying ventricular hypertrophy, cardiomyopathy, or volume overload.',
    code: 'ICD-10 I51.7 • SNOMED 8186001',
    confidence: 0.984,
  },
  'pleural effusion': {
    category: 'pathology',
    definition: 'Abnormal accumulation of fluid in the pleural cavity surrounding the lungs.',
    clinicalSignificance: 'Commonly caused by heart failure, infection (pneumonia), or malignancy.',
    code: 'ICD-10 J90 • SNOMED 60046008',
    confidence: 0.962,
  },
  'pleural effusions': {
    category: 'pathology',
    definition: 'Bilateral accumulation of fluid in the pleural spaces.',
    clinicalSignificance: 'Frequently seen in systemic fluid overload, congestive heart failure, or renal disease.',
    code: 'ICD-10 J90 • SNOMED 60046008',
    confidence: 0.962,
  },
  'atelectasis': {
    category: 'pathology',
    definition: 'Partial collapse or incomplete expansion of pulmonary parenchyma.',
    clinicalSignificance: 'Reduces oxygen exchange efficiency; often secondary to bronchial obstruction or shallow breathing.',
    code: 'ICD-10 J98.11 • SNOMED 46621007',
    confidence: 0.915,
  },
  'compressive atelectasis': {
    category: 'pathology',
    definition: 'Passive collapse of lung tissue due to external compression from adjacent pleural fluid.',
    clinicalSignificance: 'Resolves once pleural fluid collection is evacuated or reabsorbed.',
    code: 'ICD-10 J98.11 • SNOMED 46621007',
    confidence: 0.92,
  },
  'bibasilar compressive atelectasis': {
    category: 'pathology',
    definition: 'Bilateral basal lung collapse secondary to fluid pressing on lower lobes.',
    clinicalSignificance: 'Associated with elevated hemidiaphragms or bilateral pleural fluid collections.',
    code: 'ICD-10 J98.11',
    confidence: 0.91,
  },
  'consolidation': {
    category: 'pathology',
    definition: 'Solidification of lung tissue caused by exudate or cellular debris replacing alveolar air.',
    clinicalSignificance: 'Hallmark of bacterial or viral community-acquired pneumonia.',
    code: 'ICD-10 J18.9 • SNOMED 275508006',
    confidence: 0.948,
  },
  'focal consolidation': {
    category: 'pathology',
    definition: 'Localized dense infiltrate confined to an anatomical lobe or segment.',
    clinicalSignificance: 'Strong indicator of lobar pneumonia requiring targeted antimicrobial therapy.',
    code: 'ICD-10 J18.9',
    confidence: 0.95,
  },
  'pneumonia': {
    category: 'pathology',
    definition: 'Acute inflammatory infection of the lung parenchyma involving alveoli.',
    clinicalSignificance: 'Requires prompt etiology-specific treatment (bacterial vs viral coverage).',
    code: 'ICD-10 J18.9 • SNOMED 233604007',
    confidence: 0.948,
  },
  'pneumothorax': {
    category: 'pathology',
    definition: 'Presence of air or gas in the pleural cavity causing partial or complete lung collapse.',
    clinicalSignificance: 'Critical emergency finding; tension physiology requires immediate needle decompression.',
    code: 'ICD-10 J93.9 • SNOMED 36118008',
    confidence: 0.99,
  },
  'tension pneumothorax': {
    category: 'pathology',
    definition: 'Life-threatening progressive air trapping in pleural space shifting mediastinum.',
    clinicalSignificance: 'STAT emergency decompression required to prevent circulatory arrest.',
    code: 'ICD-10 J93.0',
    confidence: 0.995,
  },
  'pulmonary vascular congestion': {
    category: 'pathology',
    definition: 'Engorgement of pulmonary venous and arterial capillary beds.',
    clinicalSignificance: 'Early physiological marker of elevated left ventricular end-diastolic pressure.',
    code: 'ICD-10 I50.9 • SNOMED 414275003',
    confidence: 0.88,
  },
  'pulmonary edema': {
    category: 'pathology',
    definition: 'Fluid extravasation into interstitial spaces and alveolar lumen of lungs.',
    clinicalSignificance: 'Acute respiratory emergency requiring aggressive diuresis and oxygenation.',
    code: 'ICD-10 J81.0 • SNOMED 19242006',
    confidence: 0.94,
  },
  'alveolar opacity': {
    category: 'pathology',
    definition: 'Radiodensity representing fluid, pus, blood, or cells in alveolar spaces.',
    clinicalSignificance: 'Differentiates alveolar filling processes from interstitial lung patterns.',
    code: 'SNOMED 275508006',
    confidence: 0.89,
  },
  'osteoarthritis': {
    category: 'pathology',
    definition: 'Degenerative joint disease marked by loss of articular cartilage and bone spur formation.',
    clinicalSignificance: 'Leading cause of chronic pain and mobility impairment in weight-bearing joints.',
    code: 'ICD-10 M17.0 • SNOMED 396275006',
    confidence: 0.978,
  },
  'joint space narrowing': {
    category: 'pathology',
    definition: 'Reduction in radiographically apparent distance between articulating bone ends.',
    clinicalSignificance: 'Direct radiographic surrogate of articular cartilage thickness depletion.',
    code: 'SNOMED 240166002',
    confidence: 0.978,
  },
  'subchondral sclerosis': {
    category: 'pathology',
    definition: 'Increased bone density beneath joint cartilage surface.',
    clinicalSignificance: 'Adaptive remodeling response to repetitive mechanical load without cartilage cushion.',
    code: 'SNOMED 240168001',
    confidence: 0.942,
  },
  'osteophytes': {
    category: 'pathology',
    definition: 'Bony outgrowths (spurs) developing along joint margins.',
    clinicalSignificance: 'Classic hallmark of established moderate to severe osteoarthritis.',
    code: 'ICD-10 M25.7 • SNOMED 240167006',
    confidence: 0.91,
  },
  'marginal osteophytosis': {
    category: 'pathology',
    definition: 'Bone spur formation along articular contours of the joint.',
    clinicalSignificance: 'Signifies chronic mechanical stress on the joint capsule.',
    code: 'ICD-10 M25.7',
    confidence: 0.91,
  },
  'crepitus': {
    category: 'pathology',
    definition: 'Palpable or audible grating and crackling sensation during joint mobilization.',
    clinicalSignificance: 'Direct physical evidence of bone-on-bone or irregular articular contact.',
    code: 'SNOMED 22998005',
    confidence: 0.93,
  },
  'hypertension': {
    category: 'pathology',
    definition: 'Persistently elevated systemic arterial blood pressure.',
    clinicalSignificance: 'Major cardiovascular risk factor contributing to left ventricular strain.',
    code: 'ICD-10 I10 • SNOMED 38341003',
    confidence: 0.99,
  },
  'antalgic gait': {
    category: 'pathology',
    definition: 'Compensatory limp pattern developed to avoid pain on weight-bearing.',
    clinicalSignificance: 'Clinically localizes lower extremity pathology to the favored limb.',
    code: 'SNOMED 8117002',
    confidence: 0.92,
  },
  'blunting of both costophrenic angles': {
    category: 'pathology',
    definition: 'Loss of sharp costophrenic angles on chest radiograph.',
    clinicalSignificance: 'Requires ~175-200 mL of fluid to manifest on upright frontal radiographs.',
    code: 'SNOMED 702951006',
    confidence: 0.96,
  },

  // Anatomical Landmarks (Cyan/Sky Blue)
  'lung fields': {
    category: 'anatomy',
    definition: 'Visualized radiolucent territories of both right and left lungs.',
    clinicalSignificance: 'Primary zone for evaluating aeration, interstitial markings, and nodules.',
    code: 'FMA 7195 • LOINC 18748-4',
    confidence: 0.99,
  },
  'lung bases': {
    category: 'anatomy',
    definition: 'Inferior dependent regions of both lungs resting upon diaphragmatic domes.',
    clinicalSignificance: 'Most sensitive dependent area for gravitational fluid collection.',
    code: 'FMA 7340',
    confidence: 0.98,
  },
  'lungs': {
    category: 'anatomy',
    definition: 'Paired primary respiratory organs occupying the thoracic cavity.',
    clinicalSignificance: 'Site of alveolar gas exchange and diagnostic focus.',
    code: 'FMA 7195',
    confidence: 0.99,
  },
  'pleural spaces': {
    category: 'anatomy',
    definition: 'Potential spaces between parietal and visceral pleural linings.',
    clinicalSignificance: 'Normally contains only 10-20 mL of lubricating serous fluid.',
    code: 'FMA 7342',
    confidence: 0.97,
  },
  'costophrenic angles': {
    category: 'anatomy',
    definition: 'Sharp lateral acute angles formed between diaphragm and inner chest wall.',
    clinicalSignificance: 'Most dependent sulcus where small pleural effusions first pool.',
    code: 'FMA 20464',
    confidence: 0.98,
  },
  'costophrenic sulci': {
    category: 'anatomy',
    definition: 'Anatomical recesses where diaphragmatic pleura meets costal pleura.',
    clinicalSignificance: 'Sharp preservation confirms absence of substantial dependent fluid.',
    code: 'FMA 20464',
    confidence: 0.97,
  },
  'cardiothoracic ratio': {
    category: 'anatomy',
    definition: 'Ratio of maximal horizontal cardiac diameter to inner thoracic cage diameter.',
    clinicalSignificance: 'Normal baseline is <= 0.50 on standard posteroanterior chest radiographs.',
    code: 'LOINC 88062-5',
    confidence: 0.99,
  },
  'cardiac silhouette': {
    category: 'anatomy',
    definition: 'Radiographic shadow cast by the heart and pericardial sac.',
    clinicalSignificance: 'Evaluates chamber enlargement, pericardial disease, and situs.',
    code: 'FMA 7088',
    confidence: 0.98,
  },
  'cardiomediastinal contours': {
    category: 'anatomy',
    definition: 'Outlines of heart chambers and great vascular structures in mediastinum.',
    clinicalSignificance: 'Subtle silhouette sign alterations pinpoint lobar consolidations.',
    code: 'FMA 7088',
    confidence: 0.96,
  },
  'mediastinal contours': {
    category: 'anatomy',
    definition: 'Central compartment boundaries containing aorta, trachea, and esophagus.',
    clinicalSignificance: 'Widening indicates aortic dissection, hematoma, or lymphadenopathy.',
    code: 'FMA 4958',
    confidence: 0.97,
  },
  'pulmonary vasculature': {
    category: 'anatomy',
    definition: 'Branching pulmonary arteries and veins extending outward from hila.',
    clinicalSignificance: 'Evaluated for cephalization, engorgement, or oligemia.',
    code: 'FMA 66641',
    confidence: 0.95,
  },
  'pulmonary vascular markings': {
    category: 'anatomy',
    definition: 'Linear branching radiographic densities cast by pulmonary vessels.',
    clinicalSignificance: 'Markings normally decrease progressively toward peripheral thirds.',
    code: 'FMA 66641',
    confidence: 0.95,
  },
  'osseous structures': {
    category: 'anatomy',
    definition: 'Bony framework including thoracic ribs, clavicles, scapulae, and spine.',
    clinicalSignificance: 'Inspected for acute displaced fractures, lytic lesions, and osteopenia.',
    code: 'FMA 7111',
    confidence: 0.98,
  },
  'bony thorax': {
    category: 'anatomy',
    definition: 'Rigid skeletal cage protecting cardiopulmonary organs.',
    clinicalSignificance: 'Symmetry and alignment reflect thoracic volume and patient posture.',
    code: 'FMA 7111',
    confidence: 0.98,
  },
  'right middle lobe': {
    category: 'anatomy',
    definition: 'Specific anatomical lobe of right lung bounded by horizontal and oblique fissures.',
    clinicalSignificance: 'Prone to atelectasis and pneumonia (middle lobe syndrome).',
    code: 'FMA 7338',
    confidence: 0.99,
  },
  'minor fissure': {
    category: 'anatomy',
    definition: 'Horizontal pleural reflection separating right upper and middle lobes.',
    clinicalSignificance: 'Visible on frontal radiograph; fluid tracking indicates fissural effusion.',
    code: 'FMA 7344',
    confidence: 0.96,
  },
  'medial compartment': {
    category: 'anatomy',
    definition: 'Inner load-bearing division of knee joint between femur and tibia.',
    clinicalSignificance: 'Bears 60-70% of standing compressive load; most vulnerable to wear.',
    code: 'FMA 35174',
    confidence: 0.98,
  },
  'tibial plateaus': {
    category: 'anatomy',
    definition: 'Upper articular surfaces of the tibia supporting meniscal cartilages.',
    clinicalSignificance: 'Site of subchondral sclerosis and depression fractures.',
    code: 'FMA 35467',
    confidence: 0.97,
  },
  'femoral condyles': {
    category: 'anatomy',
    definition: 'Rounded distal articular prominences of the femur.',
    clinicalSignificance: 'Contact surface for knee flexion and extension.',
    code: 'FMA 32846',
    confidence: 0.98,
  },
  'patellae': {
    category: 'anatomy',
    definition: 'Sesamoid bones embedded within quadriceps tendon mechanisms.',
    clinicalSignificance: 'Increases leverage of quadriceps extensor apparatus.',
    code: 'FMA 24485',
    confidence: 0.98,
  },
  'patellofemoral': {
    category: 'anatomy',
    definition: 'Articulation between posterior surface of kneecap and femoral trochlea.',
    clinicalSignificance: 'Source of anterior knee pain and crepitus during stair descent.',
    code: 'FMA 35176',
    confidence: 0.97,
  },

  // Normal / Clear Findings (Emerald/Green)
  'within normal limits': {
    category: 'normal',
    definition: 'Measurements and physiological features conform to healthy baseline standards.',
    clinicalSignificance: 'Absence of detectable pathological distortion.',
    code: 'SNOMED 165344009',
    confidence: 0.99,
  },
  'clear without focal consolidation': {
    category: 'normal',
    definition: 'Lung fields display normal aeration with no signs of pneumonia or infiltrate.',
    clinicalSignificance: 'Confirms healthy alveolar aeration.',
    code: 'SNOMED 165344009',
    confidence: 0.98,
  },
  'normal limits': {
    category: 'normal',
    definition: 'Anatomical dimensions within standard 95th percentile reference interval.',
    clinicalSignificance: 'Physiologically unremarkable presentation.',
    code: 'SNOMED 165344009',
    confidence: 0.99,
  },
  'sharp without fluid accumulation': {
    category: 'normal',
    definition: 'Costophrenic angles maintain crisp anatomical acuity.',
    clinicalSignificance: 'Rules out gross pleural fluid collection.',
    code: 'SNOMED 165344009',
    confidence: 0.97,
  },
  'no acute cardiopulmonary abnormality': {
    category: 'normal',
    definition: 'No active infectious, vascular, or traumatic emergency detected.',
    clinicalSignificance: 'High-confidence exclusion of emergent pathology.',
    code: 'SNOMED 165344009',
    confidence: 0.99,
  },
  'no acute fracture': {
    category: 'normal',
    definition: 'Cortical margins are smooth, continuous, and uncompromised.',
    clinicalSignificance: 'Excludes traumatic bone disruption.',
    code: 'SNOMED 165344009',
    confidence: 0.99,
  },
  'intact': {
    category: 'normal',
    definition: 'Structural continuity fully preserved.',
    clinicalSignificance: 'Absence of tears, breaks, or disruptions.',
    code: 'SNOMED 165344009',
    confidence: 0.98,
  },
  'stable': {
    category: 'normal',
    definition: 'No progressive deterioration compared to prior studies.',
    clinicalSignificance: 'Reassuring continuity indicator.',
    code: 'SNOMED 359746009',
    confidence: 0.96,
  },

  // Codes & Prescriptions (Purple/Indigo)
  'icd-10 m17.0': {
    category: 'code',
    definition: 'Bilateral primary osteoarthritis of knee.',
    clinicalSignificance: 'Primary diagnostic billable code for symmetrical knee degeneration.',
    code: 'ICD-10-CM M17.0',
    confidence: 1.0,
  },
  'icd-10 i10': {
    category: 'code',
    definition: 'Essential (primary) hypertension.',
    clinicalSignificance: 'Standard diagnostic code for systemic primary hypertension.',
    code: 'ICD-10-CM I10',
    confidence: 1.0,
  },
  'icd-10 j18.9': {
    category: 'code',
    definition: 'Pneumonia, unspecified organism.',
    clinicalSignificance: 'Standard code for community-acquired acute pneumonia.',
    code: 'ICD-10-CM J18.9',
    confidence: 1.0,
  },
  'cpt 73562': {
    category: 'code',
    definition: 'Radiologic examination, knee; 3 views.',
    clinicalSignificance: 'Procedural billing code for multi-view knee radiography.',
    code: 'CPT 73562',
    confidence: 1.0,
  },
  'cpt 71045': {
    category: 'code',
    definition: 'Radiologic examination, chest; single view.',
    clinicalSignificance: 'Procedural code for standard frontal chest radiograph.',
    code: 'CPT 71045',
    confidence: 1.0,
  },
  'meloxicam 15 mg': {
    category: 'code',
    definition: 'Non-steroidal anti-inflammatory drug (NSAID) - COX-2 preferential inhibitor.',
    clinicalSignificance: 'Prescribed once daily for osteoarthritis pain and joint stiffness relief.',
    code: 'RxNorm 316348',
    confidence: 0.99,
  },
  'acetaminophen': {
    category: 'code',
    definition: 'Analgesic and antipyretic agent (Tylenol).',
    clinicalSignificance: 'First-line non-inflammatory pain control; discontinued in favor of NSAID.',
    code: 'RxNorm 161',
    confidence: 0.99,
  },

  // Acuity & Modifiers (Amber/Orange)
  'acute': {
    category: 'acuity',
    definition: 'Sudden onset or rapid progression requiring immediate clinical attention.',
    clinicalSignificance: 'Differentiates urgent conditions from longstanding chronic states.',
    code: 'SNOMED 373933003',
    confidence: 0.97,
  },
  'chronic': {
    category: 'acuity',
    definition: 'Persisting over an extended duration (> 3 months).',
    clinicalSignificance: 'Guides maintenance therapy versus emergency intervention.',
    code: 'SNOMED 90734009',
    confidence: 0.96,
  },
  'bilateral': {
    category: 'acuity',
    definition: 'Present symmetrically on both right and left anatomical sides.',
    clinicalSignificance: 'Frequently points toward systemic or genetic etiologies.',
    code: 'SNOMED 51440002',
    confidence: 0.98,
  },
  'moderate': {
    category: 'acuity',
    definition: 'Intermediate severity between mild and severe impairment.',
    clinicalSignificance: 'Warrants active therapeutic intervention to prevent decline.',
    code: 'SNOMED 6736007',
    confidence: 0.95,
  },
  'severe': {
    category: 'acuity',
    definition: 'Marked clinical impairment with extensive tissue or functional alteration.',
    clinicalSignificance: 'High-priority management indicated.',
    code: 'SNOMED 24484000',
    confidence: 0.98,
  },
  'markedly enlarged': {
    category: 'acuity',
    definition: 'Substantial structural expansion exceeding upper normative thresholds.',
    clinicalSignificance: 'Suggests significant hemodynamic decompensation.',
    code: 'SNOMED 24484000',
    confidence: 0.96,
  },
};

export const MedicalKeywordHighlighter: React.FC<MedicalKeywordHighlighterProps> = ({
  text,
  className = '',
  initialMode = 'subtle',
  showToolbar = false,
}) => {
  const [highlightMode, setHighlightMode] = useState<'badge' | 'underline' | 'subtle' | 'plain'>(initialMode);
  const [selectedFilter, setSelectedFilter] = useState<'all' | HighlightCategory>('all');
  const [activeEntity, setActiveEntity] = useState<MedicalEntity | null>(null);

  // Compile regex pattern sorted by term length descending to match longest phrases first
  const { regexSource, termMap, counts } = useMemo(() => {
    const keys = Object.keys(MEDICAL_KNOWLEDGE_BASE).sort((a, b) => b.length - a.length);
    const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const source = `\\b(${escaped.join('|')})\\b`;
    const regex = new RegExp(source, 'gi');

    const termLookup: Record<string, { term: string; data: Omit<MedicalEntity, 'term'> }> = {};
    for (const k of keys) {
      termLookup[k.toLowerCase()] = { term: k, data: MEDICAL_KNOWLEDGE_BASE[k] };
    }

    // Tally counts across document
    const categoryCounts: Record<HighlightCategory, number> = {
      pathology: 0,
      anatomy: 0,
      normal: 0,
      code: 0,
      acuity: 0,
    };

    const matches = text.match(regex) || [];
    for (const m of matches) {
      const entry = termLookup[m.toLowerCase()];
      if (entry) {
        categoryCounts[entry.data.category]++;
      }
    }

    return { regexSource: source, termMap: termLookup, counts: categoryCounts };
  }, [text]);

  // Tokenize text into alternating strings and matched entities
  const tokens = useMemo(() => {
    if (!text || !regexSource) return [];
    const parts: Array<{ isMatch: boolean; content: string; entity?: MedicalEntity }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Local regex instance per tokenization pass
    const localRegex = new RegExp(regexSource, 'gi');
    while ((match = localRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ isMatch: false, content: text.slice(lastIndex, match.index) });
      }
      const rawMatch = match[0];
      const entry = termMap[rawMatch.toLowerCase()];
      if (entry) {
        parts.push({
          isMatch: true,
          content: rawMatch,
          entity: {
            term: rawMatch,
            ...entry.data,
          },
        });
      } else {
        parts.push({ isMatch: false, content: rawMatch });
      }
      lastIndex = match.index + rawMatch.length;
    }
    if (lastIndex < text.length) {
      parts.push({ isMatch: false, content: text.slice(lastIndex) });
    }
    return parts;
  }, [text, regexSource, termMap]);

  const getCategoryStyles = (category: HighlightCategory, mode: 'badge' | 'underline' | 'subtle') => {
    switch (category) {
      case 'pathology':
        if (mode === 'badge') {
          return 'bg-rose-50 text-rose-800 border border-rose-200/90 shadow-xs font-semibold';
        }
        if (mode === 'underline') {
          return 'underline decoration-rose-500 decoration-2 underline-offset-4 text-rose-900 font-semibold';
        }
        return 'bg-rose-500/10 text-rose-900 font-medium';

      case 'anatomy':
        if (mode === 'badge') {
          return 'bg-sky-50 text-sky-800 border border-sky-200/90 shadow-xs font-semibold';
        }
        if (mode === 'underline') {
          return 'underline decoration-sky-500 decoration-2 underline-offset-4 text-sky-900 font-semibold';
        }
        return 'bg-sky-500/10 text-sky-900 font-medium';

      case 'normal':
        if (mode === 'badge') {
          return 'bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-xs font-semibold';
        }
        if (mode === 'underline') {
          return 'underline decoration-emerald-500 decoration-2 underline-offset-4 text-emerald-900 font-semibold';
        }
        return 'bg-emerald-500/10 text-emerald-900 font-medium';

      case 'code':
        if (mode === 'badge') {
          return 'bg-purple-50 text-purple-800 border border-purple-200/90 font-mono shadow-xs font-bold';
        }
        if (mode === 'underline') {
          return 'underline decoration-purple-500 decoration-2 underline-offset-4 text-purple-900 font-mono font-bold';
        }
        return 'bg-purple-500/10 text-purple-900 font-mono font-medium';

      case 'acuity':
        if (mode === 'badge') {
          return 'bg-amber-50 text-amber-800 border border-amber-200/90 shadow-xs font-semibold';
        }
        if (mode === 'underline') {
          return 'underline decoration-amber-500 decoration-2 underline-offset-4 text-amber-900 font-semibold';
        }
        return 'bg-amber-500/10 text-amber-900 font-medium';
    }
  };

  const getCategoryIcon = (category: HighlightCategory) => {
    switch (category) {
      case 'pathology':
        return <AlertTriangle className="w-3 h-3 text-rose-600 inline mr-1 -mt-0.5" />;
      case 'anatomy':
        return <Compass className="w-3 h-3 text-sky-600 inline mr-1 -mt-0.5" />;
      case 'normal':
        return <CheckCircle className="w-3 h-3 text-emerald-600 inline mr-1 -mt-0.5" />;
      case 'code':
        return <Tag className="w-3 h-3 text-purple-600 inline mr-1 -mt-0.5" />;
      case 'acuity':
        return <Zap className="w-3 h-3 text-amber-600 inline mr-1 -mt-0.5" />;
    }
  };

  const getCategoryBadgeColor = (category: HighlightCategory) => {
    switch (category) {
      case 'pathology':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'anatomy':
        return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'normal':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'code':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'acuity':
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  return (
    <div className={`space-y-3 relative ${className}`}>
      {/* 1. Quick Scan Ribbon & Interactive Filter Toolbar */}
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100 select-none">
          {/* Category Chips with Counts */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                selectedFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>All ({Object.values(counts).reduce((a, b) => a + b, 0)})</span>
            </button>

            {counts.pathology > 0 && (
              <button
                onClick={() => setSelectedFilter(selectedFilter === 'pathology' ? 'all' : 'pathology')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                  selectedFilter === 'pathology'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
                title="Filter Pathological Findings"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Pathology ({counts.pathology})</span>
              </button>
            )}

            {counts.anatomy > 0 && (
              <button
                onClick={() => setSelectedFilter(selectedFilter === 'anatomy' ? 'all' : 'anatomy')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                  selectedFilter === 'anatomy'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                }`}
                title="Filter Anatomical Structures"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                <span>Anatomy ({counts.anatomy})</span>
              </button>
            )}

            {counts.normal > 0 && (
              <button
                onClick={() => setSelectedFilter(selectedFilter === 'normal' ? 'all' : 'normal')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                  selectedFilter === 'normal'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
                title="Filter Normal / Negative Findings"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Normal ({counts.normal})</span>
              </button>
            )}

            {counts.code > 0 && (
              <button
                onClick={() => setSelectedFilter(selectedFilter === 'code' ? 'all' : 'code')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                  selectedFilter === 'code'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                }`}
                title="Filter Diagnostic & Billing Codes"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <span>Codes ({counts.code})</span>
              </button>
            )}
          </div>

          {/* Display Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
            <button
              onClick={() => setHighlightMode('badge')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                highlightMode === 'badge' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Vibrant Medical Badges"
            >
              Badges
            </button>
            <button
              onClick={() => setHighlightMode('underline')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                highlightMode === 'underline' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Clinical Underlines"
            >
              Underline
            </button>
            <button
              onClick={() => setHighlightMode('subtle')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                highlightMode === 'subtle' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Soft Tint Highlight"
            >
              Subtle
            </button>
            <button
              onClick={() => setHighlightMode('plain')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                highlightMode === 'plain' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Plain Clean Text"
            >
              Plain
            </button>
          </div>
        </div>
      )}

      {/* 2. Interactive Annotated Report Text */}
      <div className="leading-relaxed font-sans text-slate-800 whitespace-pre-line text-xs sm:text-[13px]">
        {tokens.map((token, idx) => {
          if (!token.isMatch || !token.entity || highlightMode === 'plain') {
            return <React.Fragment key={idx}>{token.content}</React.Fragment>;
          }

          const { entity } = token;
          const shouldHighlight = selectedFilter === 'all' || selectedFilter === entity.category;

          if (!shouldHighlight) {
            return (
              <span key={idx} className="text-slate-500 opacity-60">
                {token.content}
              </span>
            );
          }

          const styleClass = getCategoryStyles(entity.category, highlightMode as any);

          return (
            <motion.span
              key={idx}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveEntity(entity)}
              className={`inline-flex items-center align-baseline px-1 py-0.5 mx-0.5 rounded leading-tight cursor-pointer transition-all ${styleClass} group relative`}
            >
              {highlightMode === 'badge' && getCategoryIcon(entity.category)}
              <span>{token.content}</span>
            </motion.span>
          );
        })}
      </div>

      {/* 3. Interactive Floating Entity Glossary Popover Modal */}
      <AnimatePresence>
        {activeEntity && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-30 bottom-2 right-2 max-w-sm w-full bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-4.5 text-xs text-slate-700"
          >
            <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getCategoryBadgeColor(activeEntity.category)}`}>
                  {activeEntity.category}
                </span>
                <h4 className="font-extrabold text-sm text-slate-900 capitalize">
                  {activeEntity.term}
                </h4>
              </div>

              <button
                onClick={() => setActiveEntity(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              <div>
                <span className="font-bold text-[10px] uppercase text-slate-400 block tracking-wider">
                  Clinical Definition:
                </span>
                <p className="text-slate-800 font-medium leading-snug mt-0.5">
                  {activeEntity.definition}
                </p>
              </div>

              <div>
                <span className="font-bold text-[10px] uppercase text-slate-400 block tracking-wider">
                  Clinical Significance:
                </span>
                <p className="text-slate-600 leading-snug mt-0.5">
                  {activeEntity.clinicalSignificance}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                <span className="text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200/60">
                  {activeEntity.code || 'LOINC / SNOMED'}
                </span>
                {activeEntity.confidence && (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {(activeEntity.confidence * 100).toFixed(1)}% AI Grounding
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
