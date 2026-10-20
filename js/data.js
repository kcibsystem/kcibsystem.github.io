// ============================================================
// KCIB DATA - KMITL ChE Inventory & Booking System
// ============================================================

const CATEGORIES = {
  instrument: {
    id: 'instrument',
    name: 'เครื่องมือ / เครื่องวิเคราะห์',
    nameShort: 'เครื่องมือ',
    icon: '',
    color: '#1565C0',
    bgColor: '#E3F2FD',
    description: 'เครื่องมือวิเคราะห์และทดสอบสำหรับงานวิจัยและการเรียนการสอน',
    bookingType: 'timed',
    requiresTimeSlot: true,
    advanceBookingDays: 3,
    weekdayOnly: true,
    operatingHours: { start: '09:00', end: '16:00' },
    maxDuration: 2
  },
  glassware: {
    id: 'glassware',
    name: 'เครื่องแก้ว',
    nameShort: 'เครื่องแก้ว',
    icon: '',
    color: '#6A1B9A',
    bgColor: '#F3E5F5',
    description: 'อุปกรณ์เครื่องแก้วสำหรับการทดลองในห้องปฏิบัติการ',
    bookingType: 'quantity',
    requiresTimeSlot: false,
    allowLongTerm: true
  },
  scientific: {
    id: 'scientific',
    name: 'อุปกรณ์วิทยาศาสตร์',
    nameShort: 'อุปกรณ์วิทย์',
    icon: '',
    color: '#2E7D32',
    bgColor: '#E8F5E9',
    description: 'อุปกรณ์วิทยาศาสตร์ทั่วไป เช่น จุกยาง, แคลมป์, ขาตั้ง',
    bookingType: 'quantity',
    requiresTimeSlot: false,
    allowLongTerm: false,
    autoMessage: 'เมื่อทำการจองแล้ว กรุณาติดต่อรับอุปกรณ์ได้ที่ห้องสำนักงานภาควิชาวิศวกรรมเคมี ชั้น 1 อาคาร 12 ในวันและเวลาราชการ (จันทร์–ศุกร์ 08:30–16:30 น.)'
  }
};

const COURSES = [
  { id: 'all', name: 'ทุกวิชา / ทั่วไป' },
  { id: 'team_project_2', name: 'TEAM PROJECT 2' },
  { id: 'chem_eng_lab', name: 'ปฏิบัติการวิศวกรรมเคมี' },
  { id: 'process_design', name: 'การออกแบบกระบวนการเคมี' },
  { id: 'senior_project', name: 'Senior Project / โครงงานนักศึกษา' },
  { id: 'research', name: 'งานวิจัย' }
];

const EQUIPMENT = [
  // ============================================================
  // เครื่องมือ / เครื่องวิเคราะห์
  // ============================================================
  {
    id: 'inst_001',
    category: 'instrument',
    name: 'Gas Chromatograph (GC)',
    model: 'Shimadzu GC-2010 Plus',
    location: 'ห้องวิเคราะห์ 301',
    description: 'วิเคราะห์สารอินทรีย์ระเหย แยกและหาปริมาณส่วนประกอบในของผสม ใช้ได้กับตัวอย่างก๊าซและของเหลว',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_002',
    category: 'instrument',
    name: 'HPLC',
    model: 'Agilent 1260 Infinity II',
    location: 'ห้องวิเคราะห์ 301',
    description: 'แยกและวิเคราะห์สารในสถานะของเหลว เหมาะสำหรับสารที่ไม่ระเหยหรือไม่ทนความร้อน',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_003',
    category: 'instrument',
    name: 'UV-Vis Spectrophotometer',
    model: 'Shimadzu UV-1900i',
    location: 'ห้องวิเคราะห์ 302',
    description: 'วัดการดูดกลืนแสงในช่วง UV-Visible สำหรับการวิเคราะห์เชิงปริมาณและคุณภาพ',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'chem_eng_lab', 'research']
  },
  {
    id: 'inst_004',
    category: 'instrument',
    name: 'FT-IR Spectrometer',
    model: 'PerkinElmer Spectrum Two',
    location: 'ห้องวิเคราะห์ 302',
    description: 'วิเคราะห์โครงสร้างทางเคมีของสาร ระบุหมู่ฟังก์ชันในโมเลกุลด้วยอินฟราเรด',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_005',
    category: 'instrument',
    name: 'Atomic Absorption Spectrophotometer (AAS)',
    model: 'PerkinElmer AAnalyst 400',
    location: 'ห้องวิเคราะห์ 303',
    description: 'วิเคราะห์ธาตุโลหะและโลหะหนักในตัวอย่างด้วยความแม่นยำสูง',
    isAvailable: true,
    courses: ['all', 'senior_project', 'research']
  },
  {
    id: 'inst_006',
    category: 'instrument',
    name: 'DSC (Differential Scanning Calorimeter)',
    model: 'TA Instruments DSC Q20',
    location: 'ห้องวิเคราะห์ 303',
    description: 'วัดการเปลี่ยนแปลงความร้อนของสาร จุดหลอมเหลว จุดเปลี่ยนสถานะ และปฏิกิริยาทางความร้อน',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_007',
    category: 'instrument',
    name: 'TGA (Thermogravimetric Analyzer)',
    model: 'TA Instruments TGA Q50',
    location: 'ห้องวิเคราะห์ 303',
    description: 'วัดการเปลี่ยนแปลงมวลของสารตามอุณหภูมิ วิเคราะห์ความเสถียรทางความร้อน',
    isAvailable: true,
    courses: ['all', 'senior_project', 'research']
  },
  {
    id: 'inst_008',
    category: 'instrument',
    name: 'Rheometer',
    model: 'Anton Paar MCR 302',
    location: 'ห้องวิเคราะห์ 304',
    description: 'วัดคุณสมบัติทางรีโอโลยี ความหนืด และความยืดหยุ่นของวัสดุและของไหล',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_009',
    category: 'instrument',
    name: 'Rotary Evaporator',
    model: 'Buchi R-300',
    location: 'ห้องปฏิบัติการ 201',
    description: 'ระเหยตัวทำละลายที่อุณหภูมิต่ำภายใต้สุญญากาศ ป้องกันการสลายตัวของสาร',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'chem_eng_lab', 'research']
  },
  {
    id: 'inst_010',
    category: 'instrument',
    name: 'High Speed Centrifuge',
    model: 'Beckman Coulter Avanti J-E',
    location: 'ห้องปฏิบัติการ 201',
    description: 'แยกส่วนประกอบต่างๆ ในตัวอย่างด้วยแรงเหวี่ยง ความเร็วสูงสุด 26,000 rpm',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_011',
    category: 'instrument',
    name: 'Freeze Dryer (Lyophilizer)',
    model: 'Labconco FreeZone 6',
    location: 'ห้องปฏิบัติการ 202',
    description: 'ทำแห้งตัวอย่างด้วยวิธีแช่แข็งและลดความดัน ไม่ทำให้สารสลายตัว',
    isAvailable: true,
    courses: ['all', 'senior_project', 'research']
  },
  {
    id: 'inst_012',
    category: 'instrument',
    name: 'Muffle Furnace',
    model: 'Nabertherm L 9/12 (อุณหภูมิสูงสุด 1200°C)',
    location: 'ห้องปฏิบัติการ 202',
    description: 'เตาเผาอุณหภูมิสูงสุด 1200°C สำหรับเผาตัวอย่างและเผาซินเตอร์วัสดุ',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_013',
    category: 'instrument',
    name: 'Spray Dryer',
    model: 'Buchi B-290',
    location: 'ห้องปฏิบัติการ 203',
    description: 'ทำแห้งสารละลายหรือสารแขวนลอยให้เป็นผงละเอียดด้วยการพ่นหมอก',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_014',
    category: 'instrument',
    name: 'BET Surface Area Analyzer',
    model: 'Micromeritics ASAP 2020',
    location: 'ห้องวิเคราะห์ 305',
    description: 'วิเคราะห์พื้นที่ผิวจำเพาะและการกระจายขนาดรูพรุนของวัสดุ',
    isAvailable: false,
    courses: ['all', 'senior_project', 'research']
  },
  {
    id: 'inst_015',
    category: 'instrument',
    name: 'Particle Size Analyzer',
    model: 'Malvern Mastersizer 3000',
    location: 'ห้องวิเคราะห์ 305',
    description: 'วัดการกระจายขนาดอนุภาคในช่วง 0.01–3500 µm ด้วยการกระเจิงแสงเลเซอร์',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'research']
  },
  {
    id: 'inst_016',
    category: 'instrument',
    name: 'Digital Viscometer',
    model: 'Brookfield DV-III Ultra',
    location: 'ห้องปฏิบัติการ 204',
    description: 'วัดความหนืดของของไหลแบบ Newtonian และ Non-Newtonian',
    isAvailable: true,
    courses: ['all', 'senior_project', 'team_project_2', 'chem_eng_lab', 'research']
  },
  {
    id: 'inst_017',
    category: 'instrument',
    name: 'Bomb Calorimeter',
    model: 'Parr 6200',
    location: 'ห้องวิเคราะห์ 306',
    description: 'วัดค่าพลังงานความร้อนจากการเผาไหม้ของสาร (Calorific value)',
    isAvailable: true,
    courses: ['all', 'senior_project', 'chem_eng_lab', 'research']
  },

  // ============================================================
  // เครื่องแก้ว
  // ============================================================
  {
    id: 'glass_001',
    category: 'glassware',
    name: 'บีกเกอร์ (Beaker) 50 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'บีกเกอร์แก้วบอโรซิลิเกต ขนาด 50 mL ทนความร้อนและสารเคมี',
    isAvailable: true,
    totalQuantity: 30,
    availableQuantity: 25,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_002',
    category: 'glassware',
    name: 'บีกเกอร์ (Beaker) 100 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'บีกเกอร์แก้วบอโรซิลิเกต ขนาด 100 mL',
    isAvailable: true,
    totalQuantity: 30,
    availableQuantity: 22,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_003',
    category: 'glassware',
    name: 'บีกเกอร์ (Beaker) 250 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'บีกเกอร์แก้วบอโรซิลิเกต ขนาด 250 mL',
    isAvailable: true,
    totalQuantity: 25,
    availableQuantity: 18,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_004',
    category: 'glassware',
    name: 'บีกเกอร์ (Beaker) 500 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'บีกเกอร์แก้วบอโรซิลิเกต ขนาด 500 mL',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 15,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_005',
    category: 'glassware',
    name: 'บีกเกอร์ (Beaker) 1000 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'บีกเกอร์แก้วบอโรซิลิเกต ขนาด 1000 mL',
    isAvailable: true,
    totalQuantity: 15,
    availableQuantity: 10,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_006',
    category: 'glassware',
    name: 'Erlenmeyer Flask 250 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'ขวดรูปกรวยแก้ว (Conical Flask) ขนาด 250 mL',
    isAvailable: true,
    totalQuantity: 25,
    availableQuantity: 20,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_007',
    category: 'glassware',
    name: 'Erlenmeyer Flask 500 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'ขวดรูปกรวยแก้ว ขนาด 500 mL',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 16,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_008',
    category: 'glassware',
    name: 'Volumetric Flask 100 mL',
    model: 'Pyrex / Duran Class A',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'ขวดกำหนดปริมาตร Class A ขนาด 100 mL ความแม่นยำสูง',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 15,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_009',
    category: 'glassware',
    name: 'Volumetric Flask 250 mL',
    model: 'Pyrex / Duran Class A',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'ขวดกำหนดปริมาตร Class A ขนาด 250 mL',
    isAvailable: true,
    totalQuantity: 15,
    availableQuantity: 12,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_010',
    category: 'glassware',
    name: 'บิวเรต (Burette) 50 mL',
    model: 'Pyrex Class B',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'บิวเรตแก้วขนาด 50 mL สำหรับการไทเทรต',
    isAvailable: true,
    totalQuantity: 15,
    availableQuantity: 10,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_011',
    category: 'glassware',
    name: 'กระบอกตวง (Graduated Cylinder) 10 mL',
    model: 'Pyrex',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'กระบอกตวงแก้ว ขนาด 10 mL',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 15,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_012',
    category: 'glassware',
    name: 'กระบอกตวง (Graduated Cylinder) 100 mL',
    model: 'Pyrex',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'กระบอกตวงแก้ว ขนาด 100 mL',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 14,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_013',
    category: 'glassware',
    name: 'Round Bottom Flask 250 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'ขวดก้นกลมแก้ว ขนาด 250 mL สำหรับการกลั่นและสังเคราะห์',
    isAvailable: true,
    totalQuantity: 15,
    availableQuantity: 10,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_014',
    category: 'glassware',
    name: 'Round Bottom Flask 500 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'ขวดก้นกลมแก้ว ขนาด 500 mL',
    isAvailable: true,
    totalQuantity: 10,
    availableQuantity: 8,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_015',
    category: 'glassware',
    name: 'กรวยแยก (Separatory Funnel) 250 mL',
    model: 'Pyrex',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'กรวยแยกแก้ว ขนาด 250 mL ใช้สกัดสารด้วยตัวทำละลาย',
    isAvailable: true,
    totalQuantity: 10,
    availableQuantity: 7,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_016',
    category: 'glassware',
    name: 'คอนเดนเซอร์ (Liebig Condenser)',
    model: 'Pyrex',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'คอนเดนเซอร์แก้ว ใช้ควบแน่นไอระเหยในการกลั่น',
    isAvailable: true,
    totalQuantity: 10,
    availableQuantity: 8,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_017',
    category: 'glassware',
    name: 'Distillation Flask 500 mL',
    model: 'Pyrex / Duran',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'ขวดกลั่นแก้ว ขนาด 500 mL พร้อมคอเอียง 75°',
    isAvailable: true,
    totalQuantity: 8,
    availableQuantity: 6,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_018',
    category: 'glassware',
    name: 'จานนาฬิกา (Watch Glass) 100 mm',
    model: '-',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'จานนาฬิกาแก้ว เส้นผ่านศูนย์กลาง 100 mm',
    isAvailable: true,
    totalQuantity: 30,
    availableQuantity: 25,
    courses: ['all'],
    glasswareFloor: 1
  },
  {
    id: 'glass_019',
    category: 'glassware',
    name: 'จานเพาะเชื้อ (Petri Dish) 90 mm',
    model: '-',
    location: 'คลังเครื่องแก้ว ชั้น 1',
    description: 'จานเพาะเชื้อแก้ว เส้นผ่านศูนย์กลาง 90 mm',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 15,
    courses: ['all'],
    glasswareFloor: 1
  },

  // ============================================================
  // อุปกรณ์วิทยาศาสตร์
  // ============================================================
  {
    id: 'sci_001',
    category: 'scientific',
    name: 'จุกยาง (Rubber Stopper) ขนาด 0 (เล็กสุด)',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'จุกยางขนาด 0 สำหรับหลอดทดลองขนาดเล็ก',
    isAvailable: true,
    totalQuantity: 50,
    availableQuantity: 40,
    courses: ['all']
  },
  {
    id: 'sci_002',
    category: 'scientific',
    name: 'จุกยาง (Rubber Stopper) ขนาด 2',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'จุกยางขนาด 2 สำหรับขวดขนาดกลาง',
    isAvailable: true,
    totalQuantity: 50,
    availableQuantity: 35,
    courses: ['all']
  },
  {
    id: 'sci_003',
    category: 'scientific',
    name: 'จุกยาง (Rubber Stopper) ขนาด 5',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'จุกยางขนาด 5 สำหรับขวดขนาดใหญ่',
    isAvailable: true,
    totalQuantity: 40,
    availableQuantity: 30,
    courses: ['all']
  },
  {
    id: 'sci_004',
    category: 'scientific',
    name: 'จุกยาง (Rubber Stopper) ขนาด 7',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'จุกยางขนาด 7 สำหรับขวดขนาดใหญ่พิเศษ',
    isAvailable: true,
    totalQuantity: 30,
    availableQuantity: 22,
    courses: ['all']
  },
  {
    id: 'sci_005',
    category: 'scientific',
    name: 'หลอดทดลอง (Test Tube) 13×100 mm',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'หลอดทดลองแก้ว ขนาด 13×100 mm',
    isAvailable: true,
    totalQuantity: 100,
    availableQuantity: 80,
    courses: ['all']
  },
  {
    id: 'sci_006',
    category: 'scientific',
    name: 'หลอดทดลอง (Test Tube) 16×150 mm',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'หลอดทดลองแก้ว ขนาด 16×150 mm',
    isAvailable: true,
    totalQuantity: 80,
    availableQuantity: 60,
    courses: ['all']
  },
  {
    id: 'sci_007',
    category: 'scientific',
    name: 'กรวยกรอง (Funnel) 75 mm',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'กรวยกรองแก้ว เส้นผ่านศูนย์กลาง 75 mm',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 15,
    courses: ['all']
  },
  {
    id: 'sci_008',
    category: 'scientific',
    name: 'แคลมป์ (Clamp) + ขาตั้ง (Ring Stand)',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'แคลมป์สำหรับยึดอุปกรณ์พร้อมขาตั้งเหล็ก',
    isAvailable: true,
    totalQuantity: 30,
    availableQuantity: 20,
    courses: ['all']
  },
  {
    id: 'sci_009',
    category: 'scientific',
    name: 'ไม้พาย / สแปทูลา (Spatula) สแตนเลส',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'ช้อนสแตนเลสสำหรับตักสารเคมี ขนาดต่างๆ',
    isAvailable: true,
    totalQuantity: 30,
    availableQuantity: 25,
    courses: ['all']
  },
  {
    id: 'sci_010',
    category: 'scientific',
    name: 'ลวดตะแกรง (Wire Gauze)',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'ลวดตะแกรงเหล็กสำหรับรองรับภาชนะบนตะเกียง',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 15,
    courses: ['all']
  },
  {
    id: 'sci_011',
    category: 'scientific',
    name: 'จานระเหย (Evaporating Dish)',
    model: 'พอร์ซเลน',
    location: 'คลังอุปกรณ์',
    description: 'จานระเหยพอร์ซเลน สำหรับระเหยตัวทำละลาย',
    isAvailable: true,
    totalQuantity: 15,
    availableQuantity: 12,
    courses: ['all']
  },
  {
    id: 'sci_012',
    category: 'scientific',
    name: 'ขวดล้าง (Wash Bottle) 500 mL',
    model: 'PE/PP',
    location: 'คลังอุปกรณ์',
    description: 'ขวดพลาสติกสำหรับบรรจุน้ำกลั่นหรือตัวทำละลาย',
    isAvailable: true,
    totalQuantity: 20,
    availableQuantity: 15,
    courses: ['all']
  },
  {
    id: 'sci_013',
    category: 'scientific',
    name: 'ที่หนีบหลอดทดลอง (Test Tube Holder)',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'ที่หนีบสำหรับจับหลอดทดลองขณะให้ความร้อน',
    isAvailable: true,
    totalQuantity: 25,
    availableQuantity: 20,
    courses: ['all']
  },
  {
    id: 'sci_014',
    category: 'scientific',
    name: 'แท่งแก้วคนสาร (Glass Stirring Rod)',
    model: '-',
    location: 'คลังอุปกรณ์',
    description: 'แท่งแก้วสำหรับคนสาร ขนาดต่างๆ',
    isAvailable: true,
    totalQuantity: 40,
    availableQuantity: 32,
    courses: ['all']
  },
  {
    id: 'sci_015',
    category: 'scientific',
    name: 'กระดาษกรอง (Filter Paper) Whatman No.1',
    model: 'Whatman No. 1',
    location: 'คลังอุปกรณ์',
    description: 'กระดาษกรอง Whatman เบอร์ 1 เส้นผ่านศูนย์กลาง 110 mm',
    isAvailable: true,
    totalQuantity: 200,
    availableQuantity: 180,
    courses: ['all']
  }
];

// ============================================================
// DEMO USERS
// ============================================================
const DEMO_USERS = [
  {
    id: 'u001',
    name: 'สมชาย ใจดี',
    email: 'student@kmitl.ac.th',
    password: 'student123',
    role: 'student',
    studentId: '65070001',
    advisorId: 'u002',
    phone: '081-234-5678',
    defaultCourse: 'team_project_2',
    dept: 'วิศวกรรมเคมี'
  },
  {
    id: 'u002',
    name: 'ผศ.ดร. วิภาวดี รักการเรียน',
    email: 'advisor@kmitl.ac.th',
    password: 'advisor123',
    role: 'advisor',
    phone: '081-987-6543',
    title: 'อาจารย์ที่ปรึกษา'
  },
  {
    id: 'u003',
    name: 'รศ.ดร. จิตติมา สุขสันต์',
    nickname: 'อ.จ้า',
    email: 'depthead@kmitl.ac.th',
    password: 'depthead123',
    role: 'dept_head',
    phone: '082-456-7890',
    title: 'หัวหน้าภาควิชาวิศวกรรมเคมี'
  },
  {
    id: 'u004',
    name: 'พิสันดิ์ มานะ',
    nickname: 'พี่พิสันดิ์',
    email: 'pisun@kmitl.ac.th',
    password: 'pisun123',
    role: 'staff',
    staffRole: 'lab_officer_1',
    phone: '083-567-8901',
    title: 'เจ้าหน้าที่ห้องปฏิบัติการ'
  },
  {
    id: 'u005',
    name: 'อ้อ รักงาน',
    nickname: 'พี่อ้อ',
    email: 'or@kmitl.ac.th',
    password: 'or123',
    role: 'staff',
    staffRole: 'lab_officer_2',
    phone: '084-678-9012',
    title: 'เจ้าหน้าที่ห้องปฏิบัติการ'
  },
  {
    id: 'u006',
    name: 'พริก เพ็ชรดี',
    nickname: 'พี่พริก',
    email: 'prik@kmitl.ac.th',
    password: 'prik123',
    role: 'staff',
    staffRole: 'team_project_officer_1',
    phone: '085-789-0123',
    title: 'เจ้าหน้าที่ TEAM PROJECT'
  },
  {
    id: 'u007',
    name: 'ตุ้ย วงษ์ไทย',
    nickname: 'พี่ตุ้ย',
    email: 'toey@kmitl.ac.th',
    password: 'toey123',
    role: 'staff',
    staffRole: 'team_project_officer_2',
    phone: '086-890-1234',
    title: 'เจ้าหน้าที่ TEAM PROJECT'
  },
  {
    id: 'u008',
    name: 'จ๋า สุดสวย',
    nickname: 'พี่จ๋า',
    email: 'ja@kmitl.ac.th',
    password: 'ja123',
    role: 'staff',
    staffRole: 'senior_officer',
    phone: '087-901-2345',
    title: 'เจ้าหน้าที่อาวุโส'
  }
];

// ============================================================
// WORKFLOW CONFIGURATIONS
// ============================================================
const WORKFLOWS = {
  // เครื่องมือ/เครื่องวิเคราะห์
  instrument: {
    id: 'instrument',
    name: 'เครื่องมือ/เครื่องวิเคราะห์',
    steps: [
      { key: 'submitted', label: 'นักศึกษาจอง', icon: '' },
      { key: 'advisor_approved', label: 'อ.ที่ปรึกษา อนุมัติ', icon: '' },
      { key: 'depthead_approved', label: 'หัวหน้าภาค อนุมัติ', icon: '' },
      { key: 'completed', label: 'เจ้าหน้าที่รับทราบ', icon: '' }
    ],
    // Who needs to approve
    approvers: ['advisor', 'dept_head'],
    // Who gets notified after full approval (can view but not approve)
    viewers: ['lab_officer_1', 'lab_officer_2'],
    deptHeadMinDaysAdvance: 1
  },
  // เครื่องแก้ว ทั่วไป (ชั้น 1)
  glassware_general: {
    id: 'glassware_general',
    name: 'เครื่องแก้ว (ทั่วไป)',
    steps: [
      { key: 'submitted', label: 'นักศึกษาจอง', icon: '' },
      { key: 'advisor_approved', label: 'อ.ที่ปรึกษา อนุมัติ', icon: '' },
      { key: 'staff_approved', label: 'พี่พิสันดิ์ อนุมัติ', icon: '' },
      { key: 'completed', label: 'รับทราบ', icon: '' }
    ],
    approvers: ['advisor', 'lab_officer_1'],
    viewers: ['dept_head', 'lab_officer_2']
  },
  // เครื่องแก้ว TEAM PROJECT 2
  glassware_team: {
    id: 'glassware_team',
    name: 'เครื่องแก้ว TEAM PROJECT 2',
    steps: [
      { key: 'submitted', label: 'นักศึกษาจอง', icon: '' },
      { key: 'advisor_approved', label: 'อ.ที่ปรึกษา อนุมัติ', icon: '' },
      { key: 'staff_approved', label: 'พี่พริก/พี่ตุ้ย อนุมัติ', icon: '' },
      { key: 'completed', label: 'รับทราบ', icon: '' }
    ],
    approvers: ['advisor', 'team_project_officer_1', 'team_project_officer_2'],
    viewers: ['dept_head', 'lab_officer_2', 'senior_officer']
  }
};

// ============================================================
// THAI PUBLIC HOLIDAYS 2025-2026
// ============================================================
const PUBLIC_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', // วันขึ้นปีใหม่
  '2025-02-12', // วันมาฆบูชา
  '2025-04-06', // วันจักรี
  '2025-04-07', // ชดเชยสงกรานต์
  '2025-04-08', // ชดเชยสงกรานต์
  '2025-04-13', // สงกรานต์
  '2025-04-14', // สงกรานต์
  '2025-04-15', // สงกรานต์
  '2025-05-01', // วันแรงงานแห่งชาติ
  '2025-05-05', // วันฉัตรมงคล
  '2025-05-12', // วันวิสาขบูชา
  '2025-06-03', // วันเฉลิมพระชนมพรรษา ร.10 (ชดเชย)
  '2025-07-11', // วันอาสาฬหบูชา
  '2025-07-28', // วันเฉลิมพระชนมพรรษา ร.10
  '2025-08-12', // วันแม่แห่งชาติ
  '2025-10-13', // วันคล้ายวันสวรรคต ร.9
  '2025-10-23', // วันปิยมหาราช
  '2025-12-05', // วันพ่อแห่งชาติ
  '2025-12-10', // วันรัฐธรรมนูญ
  '2025-12-31', // วันสิ้นปี
  // 2026
  '2026-01-01', // วันขึ้นปีใหม่
  '2026-04-06', // วันจักรี
  '2026-04-13', // สงกรานต์
  '2026-04-14', // สงกรานต์
  '2026-04-15', // สงกรานต์
  '2026-05-01', // วันแรงงาน
  '2026-05-05', // วันฉัตรมงคล
  '2026-07-28', // วันเฉลิมพระชนมพรรษา ร.10
  '2026-08-12', // วันแม่แห่งชาติ
  '2026-10-13', // วันคล้ายวันสวรรคต ร.9
  '2026-10-23', // วันปิยมหาราช
  '2026-12-05', // วันพ่อแห่งชาติ
  '2026-12-10', // วันรัฐธรรมนูญ
  '2026-12-31', // วันสิ้นปี
]);
