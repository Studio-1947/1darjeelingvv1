/**
 * The people behind aangan, mirrored from the Studio 1947 product page
 * (https://www.1947.io/products/aangan/). Photos live in /public/team.
 *
 * `crop` is the card framing used on that page: zoom (`z`) and the focal
 * point (`x`, `y`) the zoom grows from.
 *
 * Bio paragraphs may wrap words in *asterisks* for emphasis.
 */
export type TeamMember = {
  slug: string;
  name: string;
  fullName: string;
  role: string;
  at: string;
  workArea: string;
  image: string;
  crop: { z: number; x: string; y: string };
  lead?: string;
  bio: string[];
  links?: { label: string; href: string }[];
};

export const TEAM: TeamMember[] = [
  {
    slug: 'rabi',
    name: 'Rabi',
    fullName: 'Rabi (Rabiul Islam)',
    role: 'Dreamer of this project',
    at: 'Founder & CEO, Studio 1947',
    workArea: 'Design & Philosophy',
    image: '/team/rabi.webp',
    crop: { z: 1.25, x: '50%', y: '24%' },
    lead: 'From Farmer to Designer: a journey rooted in local wisdom, shaped by global practice.',
    bio: [
      "Rabi is the founder of Studio 1947, a consulting and innovation studio working across Data, Design, Technology, Communication and Research. He started the studio in 2025 with a simple belief: the most meaningful design doesn't choose between local wisdom and global relevance. It builds from both. Under his direction, Studio 1947 works with organisations to turn complex, human problems into solutions that are as thoughtful as they are useful.",
      "Rabi's path into design wasn't the usual one. He began by studying Philosophy at Presidency University in Kolkata. There he spent his time on Indian and Western thought, logic, ethics and socio-political theory. On the side, he designed posters for college events, first by hand, then digitally. That early urge to visualise ideas eventually pulled him fully into design. He went on to earn his MA at the Srishti Institute of Art, Design and Technology in Bengaluru. There he sharpened a human-centred, ethnographic approach to UI/UX, grounded as much in listening to people as in shaping interfaces.",
      'His career since has covered an unusually wide range of work. As Head of Design at AIcrowd in Geneva, he led visual design and product experience for AI research challenges. He worked alongside partners like OpenAI, Facebook AI, Sony, Amazon, EPFL and Carnegie Mellon University, and helped shape experiences for a global community of over 60,000 developers and AI researchers. That journey took him from Artist in Residence to the top of the design team. As Design Director at Inclusive Minds in Bengaluru, he turned to design for democracy and civic voice. He built conversation-based campaigns, design systems and data-centric dashboards for socio-political engagement. Alongside this, he has spent years as a design consultant to the Friedrich Ebert Stiftung. There he made publication layouts and cover designs for a twelve-volume research series on Artificial Intelligence, along with branding and social media work to widen its public reach.',
      'Rabi describes his practice as sitting *between* product and communication design. He is equally at home mapping a user journey or building the story and visual identity around it. His toolkit covers design strategy, UI/UX design, information architecture, design systems, wireframing and prototyping, user research and journey mapping, ethnographic research, data storytelling, dashboard design, brand and packaging design, and strategic presentations. He has brought this range to organisations as varied as Tata Motors, Bosch, Room to Read, Bihar Tourism, the Seerave Foundation, and grassroots initiatives like Know Your Neighbour and the Jharkhand Government. He moves easily between global technology companies and community-rooted social impact work.',
      'For Rabi, design and social responsibility go together. Since 2024, he has run free design workshops on design thinking, digital literacy and AI awareness, mentoring students, youth and grassroots communities. In 2020, during the Covid pandemic and the Amphan super-cyclone, he helped the Quarantine Student Youth Network raise over €300,000 to support affected families. For him, design and organising for people are part of the same practice.',
      "At the core of it all is a simple philosophy: *he believes in people and nature*. He sees design not as beauty for its own sake, but as a tool for connection, storytelling and problem-solving. It holds local tradition and global systems in the same frame, and balances function with emotional depth. With Studio 1947, he's building a home for exactly that kind of work: design that aims to be meaningful first.",
    ],  },
  {
    slug: 'dipam',
    name: 'Dipam',
    fullName: 'Dipam',
    role: 'Co-creator',
    at: 'Co-founder, Studio 1947',
    workArea: 'Software & AI Engineer',
    image: '/team/dipam.webp',
    crop: { z: 1.25, x: '50%', y: '24%' },
    bio: [
      'Dipam is a Co-founder and Software & AI Engineer at Studio 1947. His work sits where artificial intelligence, software engineering and digital systems meet.',
    ],
    links: [{ label: 'Google Scholar Profile →', href: 'https://scholar.google.com/citations?user=8joRMD8AAAAJ&hl=en' }],
  },
  {
    slug: 'anjali',
    name: 'Anjali',
    fullName: 'Anjali Chetri',
    role: 'Co-creator',
    at: 'Co-founder, Studio 1947',
    workArea: 'Human Resources',
    image: '/team/anjali.webp',
    crop: { z: 1.25, x: '50%', y: '24%' },
    bio: [
      'Anjali Chetri comes from the quiet hills of Mirik, Darjeeling, and brings a deep sensitivity to people and systems. She graduated from Mirik College, where she studied History, Political Science, English and Environmental Studies, and she blends empathy with clear thinking. She is currently pursuing an MBA from IGNOU, which deepens the business grounding she brings to the studio. She has hands-on experience managing three retail shops, including team coordination and account handling. So Anjali understands the human side of business as much as its day-to-day running. At Studio 1947, she nurtures a culture where people feel seen, heard and trusted, making HR the heart of the studio.',
    ],
  },
  {
    slug: 'subhendu',
    name: 'Subhendu',
    fullName: 'Subhendu Kundu',
    role: 'Co-creator',
    at: 'Co-founder, Studio 1947',
    workArea: 'Regional Collaborations',
    image: '/team/subhendu.webp',
    crop: { z: 1.2, x: '50%', y: '24%' },
    bio: [
      'Subhendu Kundu is an Ayurvedic medical practitioner with over 10 years of experience. He currently practices at Mirik Hospital. Subhendu is also a passionate curriculum designer focused on children’s health in rural communities. With a strong background in medicine and public health, he designs psychologically grounded curricula for children and teenagers.',
      'Subhendu started with Studio 1947 as an advisor and is now a Co-founder. He shapes the programmes and curricula for skill development and capacity building, bringing valuable experience in managing large-scale operations and communicating well. His deep understanding of rural health challenges, and his proven record in curriculum design, give our Skill Development Training Programmes a different approach.',
    ],
  },
  {
    slug: 'subhayu',
    name: 'Subhayu',
    fullName: 'Subhayu Bhattacharjee',
    role: 'Advisor',
    at: 'Academic Advisor, Studio 1947',
    workArea: 'Communication & Research',
    image: '/team/subhayu.webp',
    crop: { z: 1.3, x: '62%', y: '34%' },
    bio: [
      "Born amid the natural plenty of Darjeeling and the Duars, Subhayu Bhattacharjee continues a legacy of learning, teaching and nurturing in the foothills of the Himalayas. He is an aspiring scholar with a PhD in Cultural Studies. His wide academic experience at Presidency University, Kolkata and various IITs prepares him to teach and research across cultural subjects, from Films and Textual Cultures to Religion and more. He is especially interested in seeing culture as a dynamic 'play' of many subjectivities.",
    ],
    links: [{ label: 'Google Scholar Profile →', href: 'https://scholar.google.com/citations?user=KfLP358AAAAJ&hl=en' }],
  },
  {
    slug: 'soumic',
    name: 'Soumic',
    fullName: 'Soumic Sarkar',
    role: 'Developer',
    at: 'Head of Technology, Studio 1947',
    workArea: 'Software Engineer',
    image: '/team/soumic.webp',
    crop: { z: 1.25, x: '50%', y: '24%' },
    bio: [
      'Soumic Sarkar is a Full Stack Developer at Studio 1947. He loves building web applications that scale and give real value to users. He works across frontend and backend, including React, Next.js, Node.js and MongoDB, and focuses on clean architecture, thoughtful collaboration and real-world impact.',
      'At Studio 1947, Soumic approaches every project with a product-first mindset, making sure every line of code improves the user experience and business outcomes. He believes in balancing performance, maintainability and future readiness, whether he is designing intuitive interfaces or tuning backend systems.',
      'He has hands-on experience leading and contributing to many kinds of projects, from portfolio platforms to banking applications, and a deep commitment to keep learning. He is certified in Data Analysis, UI/UX Design and Web Development. He sees technology not as a race for trends but as a tool to build products that work, last and make a difference.',
    ],
  },
  {
    slug: 'santam',
    name: 'Santam',
    fullName: 'Santam',
    role: 'Developer',
    at: 'Chief of Staff, Studio 1947',
    workArea: 'Full-Stack Developer',
    image: '/team/santam.webp',
    crop: { z: 1.25, x: '50%', y: '24%' },
    bio: [
      'His development journey began with a deep curiosity about how things work behind the screen. What started as a hobby, tinkering with websites and building small projects, soon grew into a real passion for understanding what makes digital experiences meaningful.',
      'Now, as Chief of Staff at Studio 1947, he uses this technical perspective to bridge strategy and execution. He plays a key role in smoothing operations and making sure the team has the structure it needs to thrive. He cares about a culture that values design and storytelling, and applies thoughtful problem-solving to help the agency deliver projects with real cultural and social impact.',
    ],
  },
  {
    slug: 'rahul',
    name: 'Rahul',
    fullName: 'Rahul',
    role: 'Developer',
    at: 'Project Manager, Studio 1947',
    workArea: 'Film & Front-End Developer',
    image: '/team/rahul.webp',
    crop: { z: 1.2, x: '50%', y: '24%' },
    bio: [
      "Rahul wears many hats at Studio 1947. He builds digital experiences as a full-stack developer and also shoots video and photography for the agency's client work. It's a rare mix that lets him move easily between code and camera, bringing a visual eye to his development work and technical precision to his shoots.",
      "On the development side, he's strong on the front end with React, TypeScript and GSAP-driven interfaces, and is growing his backend skills with Node.js, PostgreSQL, NestJS and Prisma. His projects include platforms rooted in Darjeeling and Northeast India, like the 1Darjeeling local marketplace and travel guide. His eye for cinematic, editorial design shows whether he's behind a screen or behind a lens.",
      'Outside the studio, he keeps that same creative energy going, picking up a camera for personal projects or playing electric guitar.',
    ],
  },
  {
    slug: 'dipanjan',
    name: 'Dipanjan',
    fullName: 'Dipanjan',
    role: 'Promotion & creatives',
    at: 'Motion Design & Video Editor, Studio 1947',
    workArea: 'Video Editing',
    image: '/team/dipanjan.webp',
    crop: { z: 1, x: '50%', y: '22%' },
    bio: [
      'I’m a professional Video Editor and Motion Graphics Designer from Tarakeswar, West Bengal, with 4 years of experience in the multimedia industry. I’m passionate about visual storytelling and bringing creative ideas to life through editing, motion, and design.',
      'Beyond post-production, I have a strong interest in cinematography and photography. My love for fine art since childhood has shaped the way I approach visuals, composition, colours, and creative expression.',
      'I’m always eager to explore new ideas, experiment with visual styles, and create work that connects with people.',
    ],
  },
  {
    slug: 'nikhil',
    name: 'Nikhil',
    fullName: 'Nikhil Raj Subba',
    role: 'Promotion & creatives',
    at: 'Project Manager, Studio 1947',
    workArea: 'Graphic Design & Video Editing',
    image: '/team/nikhilsubba.webp',
    crop: { z: 1.4, x: '50%', y: '24%' },
    bio: [
      'I am a creative designer from Soureni, Mirik. I work in visual communication, video production and graphic design. I graduated in English Honours from Mirik College and did my master’s degree in English Honours at the University of North Bengal.',
      'Alongside my studies, serving as General Secretary of my college strengthened my leadership, organisational and project management skills. My creative work draws deeply on travel, music, painting and local art traditions. That helps me make design that looks good and means something.',
    ],
  },
];
