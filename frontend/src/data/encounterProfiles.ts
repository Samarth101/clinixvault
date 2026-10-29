import { SpeakerTurn, PatientReport } from '../types';

export interface EncounterClinicalProfile {
  encounterId: string;
  patientName: string;
  mrn: string;
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  patientReport: PatientReport;
  diarizationTurns: SpeakerTurn[];
}

export const ENCOUNTER_PROFILES: Record<string, EncounterClinicalProfile> = {
  // Eleanor Vance
  "ENC-9082": {
    encounterId: "ENC-9082",
    patientName: "Eleanor Vance",
    mrn: "MRN-782194",
    soap: {
      subjective: "Patient is a 58-year-old female presenting with bilateral knee pain, right greater than left, progressive over the last several months. Symptoms exacerbate with morning stiffness lasting approximately 45 minutes and worsen following 15 minutes of weight-bearing ambulation and stair negotiation with audible clicking. Acetaminophen provides minimal relief. Denies systemic fevers, erythema, joint locking, or sudden buckling.",
      objective: "Vitals: BP 128/82 mmHg, HR 72 bpm, SpO2 99%, Temp 98.4°F, BMI 27.4 kg/m².\nKnee Exam: Moderate patellofemoral and medial compartment crepitus bilaterally (R > L). Mild tenderness along right medial joint line. No visible effusion, erythema, or calor. Stable to anterior/posterior drawer and valgus/varus stress.\nGait: Antalgic gait favoring right lower extremity.",
      assessment: "1. Bilateral Primary Osteoarthritis of Knee (ICD-10 M17.0): Clinical signs and symptom progression consistent with moderate degenerative joint disease with medial joint space predilection.\n2. Essential Hypertension (ICD-10 I10): Blood pressure borderline elevated at 128/82 mmHg today, historical management stable.",
      plan: "1. Diagnostics: Ordered bilateral standing weight-bearing AP, lateral, and sunrise views of knees (CPT 73562).\n2. Medications: Initiate Meloxicam 15 mg PO once daily with meals for symptomatic anti-inflammatory relief. Discontinue acetaminophen.\n3. Rehabilitation: Physical therapy referral for closed-chain quadriceps strengthening (2x/week for 6 weeks).\n4. Follow-Up: Re-evaluate in clinic in 3 weeks to review radiographic findings and symptom response."
    },
    patientReport: {
      headline: "Your knee examination shows wear-and-tear arthritis that we have a clear, effective plan to treat.",
      what_was_examined: "Physical exam of both knees, range of motion, walking stability, and vital signs.",
      doctor_explanation: "Hello Eleanor! We reviewed your symptoms and examined your knees today. You have moderate wear-and-tear arthritis in your knees, particularly on the inner side of your right knee. The natural cartilage cushion has thinned out, which causes the morning stiffness, clicking, and discomfort when climbing stairs.\n\nThe wonderful news is that your joint is physically stable without swelling or infections. We are starting you on an anti-inflammatory medicine and referring you to physical therapy to strengthen your thigh muscles so your daily walks feel much smoother.",
      key_findings: [
        "Right Knee: Mild tenderness along the inner joint line with cracking sounds (crepitus).",
        "Vitals: Blood pressure 128/82 mmHg, heart rate 72 bpm, oxygen 99% — very stable.",
        "Gait: Limping slightly to favor your right leg due to morning stiffness."
      ],
      what_it_means: "Your joint cushion is wearing down, which causes friction. Strengthening your leg muscles acts as a natural shock absorber to take pressure off the bone.",
      next_steps: [
        "Take Meloxicam (15 mg) once a day with food to calm down inflammation and pain.",
        "Stop taking acetaminophen (Tylenol) since the new anti-inflammatory will replace it.",
        "Attend physical therapy sessions (2x a week for 6 weeks) for leg strengthening.",
        "Get standing knee X-rays as ordered so we can check cartilage thickness.",
        "Follow-up with Dr. Amanda Chen in 3 weeks to review your X-rays and symptom response."
      ],
      jargon_translations: [
        {
          medical_term: "Primary Osteoarthritis",
          simple_meaning: "Natural wear-and-tear of joint cartilage",
          context: "Thinning of the protective rubbery cushion between leg bones."
        },
        {
          medical_term: "Patellofemoral Crepitus",
          simple_meaning: "Clicking or crunching under kneecap",
          context: "The sound of cartilage moving when bending your knee."
        },
        {
          medical_term: "Antalgic Gait",
          simple_meaning: "A protective limp",
          context: "Walking in a way that minimizes weight and pain on your right leg."
        }
      ],
      questions_for_doctor: [
        "Should I apply heat or cold when my knees feel stiff in the morning?",
        "What kind of shoes or arch supports are best for walking with knee arthritis?",
        "How soon after starting physical therapy should I notice less stiffness?"
      ],
      reading_level: "Grade 6 (Plain Language Certified)"
    },
    diarizationTurns: [
      {
        id: "turn-1",
        speaker: "Doctor",
        timestamp: "00:03",
        audioStartMs: 3100,
        audioEndMs: 8400,
        text: "Good morning Eleanor. I see you're here today for your knees. Can you walk me through how they've been feeling since our last visit?"
      },
      {
        id: "turn-2",
        speaker: "Patient",
        timestamp: "00:09",
        audioStartMs: 9200,
        audioEndMs: 19800,
        text: "Good morning Dr. Chen. It's been stiffer, especially in the mornings for about 45 minutes. The right knee clicks every time I climb stairs, and after walking for 15 minutes the aching gets quite dull and deep.",
        highlightedCodes: ["ICD-10 M17.0"]
      },
      {
        id: "turn-3",
        speaker: "Doctor",
        timestamp: "00:21",
        audioStartMs: 21100,
        audioEndMs: 28500,
        text: "Understood. Has the over-the-counter acetaminophen provided any relief, or have you had any swelling, redness, or giving way?"
      },
      {
        id: "turn-4",
        speaker: "Patient",
        timestamp: "00:29",
        audioStartMs: 29200,
        audioEndMs: 39600,
        text: "The Tylenol barely touches it now. Mild swelling around the medial joint line at night, but no fever or sudden locking. My blood pressure also seems a bit elevated recently.",
        highlightedCodes: ["ICD-10 I10"]
      },
      {
        id: "turn-5",
        speaker: "Doctor",
        timestamp: "00:41",
        audioStartMs: 41000,
        audioEndMs: 53200,
        text: "On exam today, you have moderate crepitus bilaterally, greater on the right, with medial joint line tenderness without effusion or ligamentous laxity. We'll order bilateral weight-bearing AP and lateral knee views.",
        highlightedCodes: ["CPT 73562", "CPT 99214"]
      },
      {
        id: "turn-6",
        speaker: "Doctor",
        timestamp: "00:54",
        audioStartMs: 54100,
        audioEndMs: 65800,
        text: "Let's start Meloxicam 15 mg daily with food for anti-inflammatory relief, refer you to physical therapy for quad strengthening, and review the radiographs next week.",
        highlightedCodes: ["RxNorm 6851"]
      }
    ]
  },

  // Robert Kowalski
  "ENC-9081": {
    encounterId: "ENC-9081",
    patientName: "Robert Kowalski",
    mrn: "MRN-642109",
    soap: {
      subjective: "Patient is a 71-year-old male with known systolic heart failure (HFrEF, baseline EF 35%) presenting for scheduled follow-up. Reports increasing exertional shortness of breath over the past 5 days, now provoked by walking 50 feet. Reports 2-pillow orthopnea and mild paroxysmal nocturnal dyspnea. Has gained 4.2 lbs over the past week. Denies chest pain, palpitations, diaphoresis, or syncope. Admits to higher dietary sodium intake over the holidays.",
      objective: "Vitals: BP 134/88 mmHg, HR 68 bpm (regular), SpO2 96% on room air, Temp 98.6°F, BMI 29.1 kg/m².\nCardiovascular: Normal S1/S2 with faint S3 gallop noted at apex. No murmurs. Jugular venous distension visualized at 7 cm above sternal angle.\nPulmonary: Bilateral crackles at lung bases extending one-quarter up the posterior lung fields. No wheezes.\nExtremities: 2+ pitting edema in bilateral ankles and lower pretibial regions.",
      assessment: "1. Acute on Chronic Systolic Heart Failure Exacerbation (ICD-10 I50.23): Clinical volume overload with elevated JVP, S3 gallop, bibasilar crackles, and peripheral edema in the setting of dietary sodium indiscretion.\n2. Essential Hypertension (ICD-10 I10): Borderline elevation under current medication regimen.",
      plan: "1. Diuretic Adjustment: Increase Furosemide (Lasix) from 40 mg to 80 mg PO once daily for 5 days, then reassess.\n2. Potassium Repletion: Continue Potassium Chloride 20 mEq daily to prevent hypokalemia.\n3. Lab Monitoring: Order stat Basic Metabolic Panel (BMP) in 3 days to monitor creatinine, BUN, and serum potassium.\n4. Dietary & Self-Care: Reinforce strict 2000 mg/day sodium restriction and 1.5 L/day fluid limit. Daily morning weights before breakfast; call clinic if weight increases by >3 lbs in 24 hours.\n5. Follow-Up: Clinic revisit with cardiology team in 7 days."
    },
    patientReport: {
      headline: "Your heart failure has a mild fluid flare-up that we are managing right away with adjusted water pills.",
      what_was_examined: "Heart sounds, lungs, neck veins, ankle swelling, oxygen level, and recent weight changes.",
      doctor_explanation: "Hello Robert! We took a close look at your heart and lungs today. Your heart is working harder because your body is holding onto extra water and salt. This extra fluid is why you have felt shorter of breath walking across the room and why your ankles have been more swollen this week.\n\nThere is no sign of a heart attack or acute danger, but we need to gently flush out this extra fluid so your lungs stay dry and you can breathe easily again.",
      key_findings: [
        "Lungs: Mild fluid crackles at the very bottom of both lungs.",
        "Ankles: Mild pitting swelling when gently pressing on your shins.",
        "Weight: Up about 4 pounds over the last week due to water retention."
      ],
      what_it_means: "Your heart's pump is slightly overloaded with fluid. Taking an increased water pill will help your kidneys pass the extra fluid so your heart doesn't have to work as hard.",
      next_steps: [
        "Take Furosemide (Lasix) 80 mg once every morning for the next 5 days.",
        "Weigh yourself every morning after using the bathroom and write it down on your chart.",
        "Keep your salt intake under 2000 mg a day (avoid canned soups, deli meats, and frozen dinners).",
        "Come in for a quick blood test in 3 days so we can make sure your kidney and potassium levels stay healthy.",
        "Call us right away if you gain more than 3 pounds in one day or feel dizzy."
      ],
      jargon_translations: [
        {
          medical_term: "Systolic Heart Failure",
          simple_meaning: "The heart pump squeezes with less strength than normal",
          context: "A chronic condition where the heart muscle needs extra support to pump blood forward."
        },
        {
          medical_term: "Orthopnea",
          simple_meaning: "Shortness of breath when lying flat",
          context: "Needing extra pillows behind your head at night so fluid doesn't pool in your lungs."
        },
        {
          medical_term: "Pitting Edema",
          simple_meaning: "Swelling that leaves a small dimple when pressed",
          context: "Water collecting under the skin in your feet and lower legs."
        }
      ],
      questions_for_doctor: [
        "What time of day is best to take my extra dose of Lasix?",
        "Can I continue my light morning walks while we adjust the medication?",
        "When should I expect my ankle swelling to go back down?"
      ],
      reading_level: "Grade 6 (Plain Language Certified)"
    },
    diarizationTurns: [
      {
        id: "turn-r1",
        speaker: "Doctor",
        timestamp: "00:02",
        audioStartMs: 2000,
        audioEndMs: 7500,
        text: "Good morning Mr. Kowalski. I noticed on your intake chart that you've been feeling a bit more winded over the past few days. Tell me what's been going on."
      },
      {
        id: "turn-r2",
        speaker: "Patient",
        timestamp: "00:08",
        audioStartMs: 8200,
        audioEndMs: 18400,
        text: "Morning Doctor. Yes, climbing the stairs to bed has felt like a marathon. My shoes feel tight around my ankles, and I've needed two pillows to sleep comfortably without coughing.",
        highlightedCodes: ["ICD-10 I50.23"]
      },
      {
        id: "turn-r3",
        speaker: "Doctor",
        timestamp: "00:19",
        audioStartMs: 19100,
        audioEndMs: 26800,
        text: "I hear some soft fluid crackles at the base of your lungs, and there's about two-plus swelling in your ankles. Did your weight change this week on the scale?"
      },
      {
        id: "turn-r4",
        speaker: "Patient",
        timestamp: "00:27",
        audioStartMs: 27500,
        audioEndMs: 36200,
        text: "I was up about four pounds yesterday morning. We had family visiting over the weekend, so I know I ate a bit more ham and salty food than I usually do.",
        highlightedCodes: ["ICD-10 E87.70"]
      },
      {
        id: "turn-r5",
        speaker: "Doctor",
        timestamp: "00:37",
        audioStartMs: 37000,
        audioEndMs: 48500,
        text: "That explains the fluid flare-up. Let's double your Lasix to 80 milligrams in the morning for 5 days, keep your salt strictly under 2000 milligrams, and get a quick blood panel in 3 days."
      }
    ]
  },

  // Sarah Jenkins
  "ENC-9080": {
    encounterId: "ENC-9080",
    patientName: "Sarah Jenkins",
    mrn: "MRN-551028",
    soap: {
      subjective: "Patient is a 44-year-old female presenting with a persistent, dry, irritating cough of 3 weeks duration following an upper respiratory viral infection. Cough is non-productive, occurs in paroxysms, and is particularly troublesome at night and upon stepping into cold air. Over-the-counter honey cough drops and dextromethorphan syrup have provided negligible relief. Denies fever, chills, hemoptysis, shortness of breath, wheezing, orthopnea, or chest pain.",
      objective: "Vitals: BP 116/74 mmHg, HR 76 bpm, SpO2 98% on ambient air, Temp 98.2°F, BMI 23.5 kg/m².\nHead, Eyes, Ears, Nose, Throat: Oropharynx pink, moist without tonsillar exudate. Mild cobblestoning of posterior pharyngeal wall consistent with post-nasal drip.\nPulmonary: Lungs completely resonant to percussion. Clear to auscultation bilaterally without wheezing, crackles, or rhonchi. No prolonged expiratory phase. Good chest expansion.\nCardiovascular: Regular rate and rhythm, normal heart sounds.",
      assessment: "1. Post-Viral Bronchial Hyperreactivity / Subacute Post-Infectious Cough (ICD-10 R05.9): Prolonged airway sensory nerve hypersensitivity following acute viral illness.\n2. Allergic Rhinitis / Upper Airway Post-Nasal Drip (ICD-10 J30.9): Contributing to nocturnal throat tickle and paroxysmal coughing episodes.",
      plan: "1. Inhaled Bronchodilator: Albuterol HFA 90 mcg inhaler, 2 puffs inhaled every 4 to 6 hours as needed for coughing paroxysms or chest tightness.\n2. Intranasal Corticosteroid: Fluticasone propionate nasal spray 50 mcg, 1 spray in each nostril daily to reduce upper airway inflammation.\n3. Non-Pharmacologic: Warm fluids, honey lozenges, and cool-mist humidifier in bedroom at night.\n4. Clinical Guidance: Reassure patient that post-viral cough typically resolves within 4-6 weeks; return for chest radiography if fevers develop or symptoms persist past 6 weeks."
    },
    patientReport: {
      headline: "Your cough is a common post-viral airway sensitivity that will heal with targeted breathing soothing treatments.",
      what_was_examined: "Your throat, lungs, oxygen level, breathing sounds, and temperature.",
      doctor_explanation: "Hello Sarah! We listened closely to your breathing today. Your lungs are completely clear and healthy, with no pneumonia, bronchitis, or signs of bacterial infection.\n\nAfter a viral cold, the sensitive nerve endings in your breathing tubes can stay 'ticklish' and irritated for several weeks. When cold air or throat drainage touches these nerves, it triggers a sudden coughing fit. We are giving you a soothing inhaler and a gentle nasal spray to calm those nerve endings down while your airways finish healing.",
      key_findings: [
        "Lungs: 100% clear with normal airflow and 98% oxygen.",
        "Throat: Mild irritation from drainage at the back of the throat, but no strep or infection.",
        "Temperature: Completely normal at 98.2°F with no fever."
      ],
      what_it_means: "Your infection has cleared, but your airways are temporarily sensitive, like skin that has recently had a mild sunburn.",
      next_steps: [
        "Use your Albuterol rescue inhaler (2 puffs) whenever you get a sudden coughing spell.",
        "Use Fluticasone nasal spray (1 spray each nostril) every morning to calm down nose drainage.",
        "Use a cool mist humidifier by your bedside at night to keep the air moist.",
        "Drink warm water with honey or lemon throughout the day to soothe your throat.",
        "Call us if you develop a fever over 100.4°F or start coughing up yellow-green phlegm."
      ],
      jargon_translations: [
        {
          medical_term: "Bronchial Hyperreactivity",
          simple_meaning: "Twitchy or extra-sensitive breathing tubes",
          context: "Airways that react to cold air or dust with a sudden reflex cough after a virus."
        },
        {
          medical_term: "Subacute Cough",
          simple_meaning: "A cough lasting between 3 and 8 weeks",
          context: "The normal recovery timeframe after recovering from a seasonal viral infection."
        },
        {
          medical_term: "Post-Nasal Drip",
          simple_meaning: "Mucus trickling down the back of your throat",
          context: "Mild fluid from the nose that tickles the vocal cords and makes you clear your throat."
        }
      ],
      questions_for_doctor: [
        "Is this cough contagious to my coworkers or family members?",
        "How many times a day is it safe to use the rescue inhaler?",
        "When should I expect the nighttime coughing fits to stop?"
      ],
      reading_level: "Grade 6 (Plain Language Certified)"
    },
    diarizationTurns: [
      {
        id: "turn-s1",
        speaker: "Doctor",
        timestamp: "00:03",
        audioStartMs: 3000,
        audioEndMs: 8200,
        text: "Good morning Sarah. You mentioned you've had a cough that just won't quit since you had that cold three weeks ago?"
      },
      {
        id: "turn-s2",
        speaker: "Patient",
        timestamp: "00:09",
        audioStartMs: 9100,
        audioEndMs: 18500,
        text: "Yes Doctor. The fever and body aches from the cold went away after four days, but this dry hacking cough keeps waking me up at night. Cold air triggers a coughing spell immediately.",
        highlightedCodes: ["ICD-10 R05.9"]
      },
      {
        id: "turn-s3",
        speaker: "Doctor",
        timestamp: "00:19",
        audioStartMs: 20000,
        audioEndMs: 28400,
        text: "I just listened to all five lobes of your lungs, and the great news is they sound crystal clear. No pneumonia, no wheezing, and your oxygen is 98 percent on room air."
      },
      {
        id: "turn-s4",
        speaker: "Patient",
        timestamp: "00:29",
        audioStartMs: 29100,
        audioEndMs: 35000,
        text: "That's a huge relief. Why does it still tickle so aggressively in my chest every few hours?",
        highlightedCodes: ["ICD-10 J30.9"]
      },
      {
        id: "turn-s5",
        speaker: "Doctor",
        timestamp: "00:36",
        audioStartMs: 36200,
        audioEndMs: 47800,
        text: "Your airway nerve endings are temporarily hypersensitive after the virus. Let's prescribe an albuterol inhaler for quick relief during coughing fits, and a nasal spray for post-nasal drip."
      }
    ]
  },

  // Marcus Rodriguez
  "ENC-9079": {
    encounterId: "ENC-9079",
    patientName: "Marcus Rodriguez",
    mrn: "MRN-893012",
    soap: {
      subjective: "Patient is a 35-year-old male athlete presenting with acute left knee pain following a twisting sports injury during a basketball game 48 hours ago. States he planted his left foot and twisted to change direction when he felt an audible 'pop' at the inner joint line. Developed moderate knee swelling 4 hours post-injury. Has experienced painful mechanical catching when flexing past 90 degrees. Has been icing and elevating with mild relief.",
      objective: "Vitals: BP 122/78 mmHg, HR 64 bpm, SpO2 99%, Temp 98.5°F, BMI 25.1 kg/m².\nLeft Knee Inspection: Moderate suprapatellar effusion present. No open skin lesions, ecchymosis, or obvious deformity.\nPalpation: Point tenderness localized along the medial joint line. No lateral joint line tenderness or tibial tubercle pain.\nRange of Motion: 0 to 110 degrees (limited by discomfort and effusion at terminal flexion).\nSpecial Tests: Positive McMurray test for medial meniscus with reproducible click and joint line pain. Negative Lachman test. Negative anterior and posterior drawer tests. Collateral ligaments stable to varus/valgus stress at 0 and 30 degrees.",
      assessment: "1. Acute Medial Meniscus Tear, Left Knee (ICD-10 S83.242A): Mechanism of twisting on planted foot with delayed effusion, medial joint line tenderness, and positive McMurray sign highly suspicious for tear.\n2. Traumatic Knee Joint Effusion (ICD-10 M25.462): Secondary to intra-articular meniscal pathology. Cruciate and collateral ligaments clinically intact.",
      plan: "1. Diagnostic Imaging: Urgent MRI of Left Knee without IV contrast (CPT 73721) to characterize tear morphology and evaluate articular cartilage.\n2. Protective Immobilization: Hinged knee brace locked in extension for ambulation; crutches provided for partial weight bearing as tolerated.\n3. Symptomatic Relief: Celecoxib 200 mg PO daily with food for anti-inflammatory pain control; continue RICE protocol (Rest, Ice 20 min TID, Compression, Elevation).\n4. Specialist Referral: Sports Medicine / Orthopedic Surgery evaluation scheduled within 72 hours following MRI acquisition."
    },
    patientReport: {
      headline: "Your knee examination shows a likely meniscus cartilage tear that we are diagnosing with an MRI and protecting.",
      what_was_examined: "Left knee stability, cartilage click tests, knee swelling, ligaments, and walking ability.",
      doctor_explanation: "Hello Marcus! We conducted a thorough orthopedic examination of your left knee today. The great news is that your main stabilizing knee ligaments—including your ACL and MCL—are strong and completely intact.\n\nHowever, your symptoms and our exam tests strongly suggest a tear in your medial meniscus, which is the rubbery shock-absorbing cushion on the inner half of your knee. We are ordering an MRI to look at the exact shape of the tear and giving you a supportive brace so you don't aggravate it while we prepare your treatment plan.",
      key_findings: [
        "Ligaments: Your ACL and side ligaments are tight, stable, and uninjured.",
        "Meniscus: Definite tenderness and a small click along the inside joint line (McMurray test).",
        "Swelling: Moderate fluid inside the knee joint capsule from the twisting injury."
      ],
      what_it_means: "The shock-absorber cushion inside your knee was pinched and torn when you twisted your foot. Protecting it now prevents further irritation to the surrounding bone.",
      next_steps: [
        "Get your scheduled Left Knee MRI scan in the diagnostic suite tomorrow.",
        "Wear the supportive hinged knee brace and use your crutches when walking.",
        "Take Celecoxib (200 mg) once a day with food to reduce swelling and pain.",
        "Ice your knee for 20 minutes at a time, 3 times a day, and keep it elevated on a pillow when resting.",
        "Meet with our Sports Orthopedic specialist on Friday to review the MRI results and discuss recovery."
      ],
      jargon_translations: [
        {
          medical_term: "Medial Meniscus",
          simple_meaning: "The C-shaped shock absorber on the inside of your knee",
          context: "A durable rubbery disc of cartilage that cushions your thigh bone on your shin bone."
        },
        {
          medical_term: "McMurray Test",
          simple_meaning: "A physical exam check where the doctor rotates your lower leg",
          context: "Used to gently test if a torn cartilage flap catches or clicks during movement."
        },
        {
          medical_term: "Joint Effusion",
          simple_meaning: "Water or fluid collected inside the joint",
          context: "The knee's natural protective swelling response after a sudden sports sprain."
        }
      ],
      questions_for_doctor: [
        "Will I need arthroscopic surgery, or can this meniscus tear heal with physical therapy?",
        "When can I begin gentle non-weight-bearing exercises like stationary cycling?",
        "How long will I need to use the crutches?"
      ],
      reading_level: "Grade 6 (Plain Language Certified)"
    },
    diarizationTurns: [
      {
        id: "turn-m1",
        speaker: "Doctor",
        timestamp: "00:02",
        audioStartMs: 2000,
        audioEndMs: 7800,
        text: "Hi Marcus. I see you had a basketball injury two nights ago. Can you show me exactly where it hurts and how it happened?"
      },
      {
        id: "turn-m2",
        speaker: "Patient",
        timestamp: "00:08",
        audioStartMs: 8400,
        audioEndMs: 18200,
        text: "Sure Dr. Chen. I was cutting left toward the hoop, planted my sneaker, and my knee twisted inward. I felt a definite pop right here on the inside edge, and by bedtime it was swollen like a grapefruit.",
        highlightedCodes: ["ICD-10 S83.242A"]
      },
      {
        id: "turn-m3",
        speaker: "Doctor",
        timestamp: "00:19",
        audioStartMs: 19100,
        audioEndMs: 28500,
        text: "I'm testing your ACL with a Lachman maneuver—that feels rock solid, so no ligament rupture. But when I rotate your tibia with this McMurray test, there is a clear click on the medial joint line."
      },
      {
        id: "turn-m4",
        speaker: "Patient",
        timestamp: "00:29",
        audioStartMs: 29500,
        audioEndMs: 36000,
        text: "Ouch, yes, that exact spot is where it catches when I try to straighten it. Does that mean the meniscus is torn?",
        highlightedCodes: ["ICD-10 M25.462"]
      },
      {
        id: "turn-m5",
        speaker: "Doctor",
        timestamp: "00:37",
        audioStartMs: 37100,
        audioEndMs: 48900,
        text: "It does point strongly toward a medial meniscus tear. We'll get an MRI tomorrow to see the tear's exact size, fit you with a hinged brace, and get you into our sports orthopedics clinic this Friday."
      }
    ]
  },

  // Elena Rostova
  "ENC-9078": {
    encounterId: "ENC-9078",
    patientName: "Elena Rostova",
    mrn: "MRN-410982",
    soap: {
      subjective: "Patient is a 66-year-old female presenting with chronic lower back pain radiating into the right posterior buttock, thigh, lateral calf, and foot of 2 months duration. Describes pain as sharp, burning, and electric, rated 7/10 at worst. Symptoms worsen significantly after sitting for more than 15 minutes and when bending forward. Notes mild numbness along the outer border of the right foot. Denies bowel or bladder incontinence, saddle anesthesia, leg weakness, or fevers.",
      objective: "Vitals: BP 130/84 mmHg, HR 70 bpm, SpO2 97%, Temp 98.3°F, BMI 26.8 kg/m².\nSpine Exam: Mild lumbar lordosis flattening with moderate right lumbar paraspinal muscle spasm. Tenderness over L5-S1 spinous interspace.\nNeurological: Strength is 5/5 in bilateral lower extremities (quadriceps, extensor hallucis longus, gastrocnemius intact). Decreased light-touch sensation in the right S1 dermatome (lateral foot and small toe). Right Achilles tendon reflex is diminished (1+) compared to left (2+). Patellar reflexes 2+ bilaterally.\nSpecial Tests: Positive right Straight Leg Raise test at 40 degrees, reproducing radiating pain below the knee. Negative contralateral (crossed) straight leg raise.",
      assessment: "1. Right Lumbar Radiculopathy, S1 Distribution (ICD-10 M54.16): Clinical signs of right S1 nerve root compression with positive straight leg raise, sensory deficit, and diminished Achilles reflex.\n2. Lumbar Intervertebral Disc Disorder with Radiculopathy, L5-S1 (ICD-10 M51.17): Probable disc herniation compressing the traversing S1 root. No cauda equina red flags.",
      plan: "1. Diagnostic Imaging: MRI of Lumbar Spine without IV contrast (CPT 72148) to confirm level and extent of disc herniation.\n2. Neuropathic Pain Regimen: Start Gabapentin 300 mg PO nightly for 3 days, titrate to 300 mg BID as tolerated for neuropathic nerve pain.\n3. Anti-Inflammatory: Meloxicam 15 mg PO once daily with meals for 14 days.\n4. Physical Therapy: Referral for directional preference spine physical therapy (McKenzie protocol) and gentle nerve gliding exercises.\n5. Ergonomics & Safety: Avoid prolonged uninterrupted sitting (>20 min) and heavy bending/lifting; follow up in 2 weeks with MRI results."
    },
    patientReport: {
      headline: "Your examination shows an irritated nerve in your lower back causing the leg pain, with an effective recovery roadmap.",
      what_was_examined: "Nerve reflexes, lower back flexibility, leg muscle strength, and sensation in your feet.",
      doctor_explanation: "Hello Elena! We examined your lower back and tested the nerves running down both of your legs today. Your leg muscle strength is completely strong and intact, and your knee reflexes are normal.\n\nHowever, one of the cushioned discs in your lower back (at the L5-S1 level) is pressing against the S1 nerve root that travels down the back of your leg into your foot. This pinch is what creates the burning, electric sensation you feel in your calf and heel. We are starting a nerve-calming medication, ordering an MRI to confirm the disc position, and guiding you through specialized physical therapy.",
      key_findings: [
        "Strength: 100% normal leg muscle strength with no weakness in your feet or toes.",
        "Reflexes: A slightly reduced ankle reflex on the right side, confirming S1 nerve irritation.",
        "Straight Leg Test: Lifting your right leg reproduced the burning pain down into your calf."
      ],
      what_it_means: "A disc in your lower spine is temporarily swollen and touching a nerve root, creating 'sciatica' symptoms that will improve as inflammation settles.",
      next_steps: [
        "Take Gabapentin (300 mg) before bedtime to calm the irritated nerve fibers and help you sleep.",
        "Take Meloxicam (15 mg) once a day with breakfast to reduce disc inflammation.",
        "Get your scheduled non-contrast Lumbar Spine MRI so we can see the exact disc image.",
        "Avoid sitting for more than 20 minutes at a time without standing up or walking for 2 minutes.",
        "Start your specialized spine physical therapy sessions for gentle nerve decompression.",
        "Follow up with us in 2 weeks to review your MRI images and check your pain score."
      ],
      jargon_translations: [
        {
          medical_term: "Lumbar Radiculopathy",
          simple_meaning: "Pinch or irritation of a nerve root in the lower back",
          context: "Often called 'sciatica,' where pain shoots down the path of the nerve into the leg."
        },
        {
          medical_term: "S1 Dermatome",
          simple_meaning: "The strip of skin connected to the S1 spinal nerve",
          context: "The outer side of your lower calf and the outer edge of your foot and pinky toe."
        },
        {
          medical_term: "Straight Leg Raise",
          simple_meaning: "A test where the doctor raises your straight leg while you lie down",
          context: "Stretches the sciatic nerve to see if an irritated spinal disc is touching it."
        }
      ],
      questions_for_doctor: [
        "Can an epidural steroid injection help if the leg pain doesn't improve with medication?",
        "Are there specific sitting cushions or lumbar chairs that help relieve pressure on the S1 nerve?",
        "What sleeping positions take the most pressure off my lower back?"
      ],
      reading_level: "Grade 6 (Plain Language Certified)"
    },
    diarizationTurns: [
      {
        id: "turn-e1",
        speaker: "Doctor",
        timestamp: "00:03",
        audioStartMs: 3000,
        audioEndMs: 8500,
        text: "Good morning Elena. I see you've had this persistent shooting pain down your right leg. Tell me how it started and what makes it worse."
      },
      {
        id: "turn-e2",
        speaker: "Patient",
        timestamp: "00:09",
        audioStartMs: 9100,
        audioEndMs: 19500,
        text: "Good morning Doctor. It started in my lower back two months ago, but now it feels like an electric wire shooting down into my right calf and outer foot. Sitting at my computer makes it burn intensely.",
        highlightedCodes: ["ICD-10 M54.16"]
      },
      {
        id: "turn-e3",
        speaker: "Doctor",
        timestamp: "00:20",
        audioStartMs: 20200,
        audioEndMs: 29000,
        text: "When I tap your right Achilles reflex, it is a bit sluggish compared to the left, and raising your straight leg at 40 degrees reproduces that calf burn. That's classic S1 nerve irritation."
      },
      {
        id: "turn-e4",
        speaker: "Patient",
        timestamp: "00:30",
        audioStartMs: 30100,
        audioEndMs: 37500,
        text: "Is it a slipped disc? I was worried it might cause permanent damage if I don't get surgery immediately.",
        highlightedCodes: ["ICD-10 M51.17"]
      },
      {
        id: "turn-e5",
        speaker: "Doctor",
        timestamp: "00:38",
        audioStartMs: 38200,
        audioEndMs: 50100,
        text: "Your motor strength is 100 percent intact, which is very reassuring and means no emergency surgery is needed. We'll start a nerve medication, order an MRI, and get you into targeted physical therapy."
      }
    ]
  }
};
