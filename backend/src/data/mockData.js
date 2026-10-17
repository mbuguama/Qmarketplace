const universities = [
  {
    id: 'uni-berkeley',
    name: 'University of California, Berkeley',
    slug: 'berkeley',
    location: 'California',
    description: 'A research-intensive campus with strong STEM and liberal arts programs.',
    logoUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'uni-stanford',
    name: 'Stanford University',
    slug: 'stanford',
    location: 'California',
    description: 'Innovation-driven teaching and a global network of students and research labs.',
    logoUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'uni-columbia',
    name: 'Columbia University',
    slug: 'columbia',
    location: 'New York',
    description: 'A premier research university balancing academic rigor with practical impact.',
    logoUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=600&q=80'
  }
];

const courses = [
  {
    id: 'course-cs61b',
    title: 'Data Structures and Algorithms',
    code: 'CS 61B',
    description: 'Core algorithms, graph traversal, memory models, and efficient data handling.',
    semester: 'Spring',
    level: 'Undergraduate',
    universityId: 'uni-berkeley'
  },
  {
    id: 'course-econ101',
    title: 'Principles of Economics',
    code: 'ECON 101',
    description: 'Microeconomics and macroeconomics fundamentals for policy and business thinking.',
    semester: 'Fall',
    level: 'Undergraduate',
    universityId: 'uni-stanford'
  },
  {
    id: 'course-bio220',
    title: 'Cell Biology',
    code: 'BIO 220',
    description: 'Structure, signaling pathways, and cellular systems relevant to research practice.',
    semester: 'Winter',
    level: 'Graduate',
    universityId: 'uni-columbia'
  }
];

const materials = [
  {
    id: 'mat-1',
    title: 'CS 61B Final Review Pack',
    type: 'Exam Papers',
    description: 'A curated set of prior exam questions, practice tasks, and revision notes.',
    price: 18.99,
    pages: 42,
    fileFormat: 'PDF',
    academicYear: '2025-2026',
    status: 'active',
    featured: true,
    universityId: 'uni-berkeley',
    courseId: 'course-cs61b',
    sellerId: 'user-demo',
    previewUrl: null
  },
  {
    id: 'mat-2',
    title: 'Economics Cheat Sheet Bundle',
    type: 'Study Summaries',
    description: 'Condensed economic frameworks and diagrams for rapid revision before assessments.',
    price: 12.5,
    pages: 25,
    fileFormat: 'PDF',
    academicYear: null,
    status: 'active',
    featured: true,
    universityId: 'uni-stanford',
    courseId: 'course-econ101',
    sellerId: 'user-demo',
    previewUrl: null
  },
  {
    id: 'mat-3',
    title: 'Cell Biology Lab Notes',
    type: 'Lecture Notes',
    description: 'High-yield lab notes and summaries covering core cellular processes and experiments.',
    price: 21,
    pages: 57,
    fileFormat: 'PDF',
    academicYear: null,
    status: 'active',
    featured: false,
    universityId: 'uni-columbia',
    courseId: 'course-bio220',
    sellerId: 'user-demo',
    previewUrl: null
  }
];

const users = [];
const orders = [];

module.exports = {
  universities,
  courses,
  materials,
  users,
  orders
};
