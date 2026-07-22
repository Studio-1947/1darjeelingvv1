// Curated, per-listing editorial content for the detail page.
//
// The listings table only stores a one-line description and a single image, so
// the richer detail page (detailed "about", photo galleries, real map
// coordinates, driver routes, festival timing, wildlife spotting sites) is
// filled from this module. Entries are keyed by the exact seed listing title.
// Anything not found here falls back to type-level defaults, so user-created
// listings still render - just with less editorial depth.

// Verified images already shipping in the app (see backend/src/seed_data.ts).
// Used as the safe fallback when a keyword photo fails to load.
export const FALLBACK = {
  himalaya: 'https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d',
  teaGarden: 'https://images.pexels.com/photos/35151733/pexels-photo-35151733.jpeg',
  teaPlantation: 'https://images.pexels.com/photos/103875/pexels-photo-103875.jpeg',
  redPanda: 'https://images.unsplash.com/photo-1542880941-1abfea46bba6',
  cafe: 'https://images.pexels.com/photos/33932441/pexels-photo-33932441.png',
} as const;

export function fallbackFor(type: string): string {
  switch (type) {
    case 'cafe':
    case 'shop': return FALLBACK.cafe;
    case 'biodiversity': return FALLBACK.redPanda;
    case 'event': return FALLBACK.teaGarden;
    default: return FALLBACK.himalaya;
  }
}

/**
 * Real keyword photo with no API key, via LoremFlickr (serves matching Flickr
 * photos). `seed` locks a deterministic image so galleries stay stable across
 * reloads and sibling slots don't collide. Pair with <SmartImg> for a fallback.
 */
export function stockPhoto(query: string, w = 1600, h = 1000, seed = 1): string {
  const tags = query.trim().split(/\s+/).map(encodeURIComponent).join(',');
  return `https://loremflickr.com/${w}/${h}/${tags}?lock=${seed}`;
}

/**
 * Bare Unsplash/Pexels URLs (as stored in seed data) serve the full-resolution
 * original - several MB per photo, which janks scrolling while cards decode.
 * Both CDNs resize on the fly via query params; other hosts pass through as-is.
 */
export function sizedImage(url: string, w = 800): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  if (url.includes('images.unsplash.com')) return `${url}${sep}auto=format&fit=crop&w=${w}&q=75`;
  if (url.includes('images.pexels.com')) return `${url}${sep}auto=compress&cs=tinysrgb&w=${w}`;
  if (url.includes('res.cloudinary.com') && url.includes('/image/upload/') && !/\/upload\/[^/]*[wqf]_/.test(url)) {
    return url.replace('/image/upload/', `/image/upload/w_${w},c_limit,q_auto/`);
  }
  return url;
}

// The five shared seed images (see backend/src/seed_data.ts). A listing whose
// image is one of these is using a default, not a real photo of itself - so we
// swap in a distinct per-listing image. Anything else is a genuine
// provider-uploaded URL and is kept as-is.
const SEED_IMAGE_SET = new Set<string>(Object.values(FALLBACK));

/** Stable numeric hash of a string - gives each listing its own image seed. */
export function seedFor(s = ''): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100000;
}

export interface ListingContent {
  about?: string;              // detailed, factual description
  hero?: string;               // curated hero photo URL, overrides the listing's own
  gallery?: string[];          // photo URLs, or keyword queries for stock photos
  coords?: [number, number];   // [lat, lng] for the map embed
  bestTime?: string;           // festivals - when to go
  routes?: string[];           // drivers - routes operated
  spotted?: string[];          // biodiversity - where it's seen
  personPhoto?: string;        // host / driver portrait keyword
}

// Approx. centre of Darjeeling town - fallback map location.
export const DARJEELING: [number, number] = [27.041, 88.263];

/**
 * Curated photos shared by every listing of a type, including provider-created
 * ones that have no CONTENT entry. A listing whose own gallery holds real photo
 * URLs keeps those instead; keyword galleries defer to these.
 */
export const TYPE_GALLERY: Record<string, string[]> = {
  homestay: [
    'https://www.thebrokebackpacker.com/wp-content/uploads/2020/06/airbnb-peru-room-by-the-beach.jpg',
    'https://cf.bstatic.com/xdata/images/hotel/square600/779368925.webp?k=f69db55f893f656a09bdd175d69844193a2f438c699f9101a4981781e923f808&o=',
    'https://dynamic-media.tacdn.com/media/vr-ha-splice-j/10/85/9b/58.jpg?w=800&h=-1',
  ],
};

export const CONTENT: Record<string, ListingContent> = {
  // ---------------- Tourism spots ----------------
  'Tiger Hill Sunrise': {
    about:
      'Tiger Hill, at roughly 2,590 m, is the highest point around Darjeeling and the region’s most famous sunrise viewpoint. On a clear morning the first light strikes Kanchenjunga - the world’s third-highest peak - turning it gold and pink, and on exceptional days Everest is visible far to the west. Visitors set out well before dawn to reach the summit, where an observation tower offers tiered viewing.',
    gallery: ['kanchenjunga sunrise', 'himalaya dawn mountains', 'darjeeling sunrise'],
    coords: [27.0028, 88.267],
  },
  'Batasia Loop & War Memorial': {
    about:
      'The Batasia Loop is a spiral railway track built in 1919 that lets the Darjeeling Himalayan Railway - the UNESCO-listed “toy train” - descend a steep gradient by looping over itself. At its centre sits a landscaped garden and the Gorkha War Memorial, honouring Gorkha soldiers who died since Indian independence. The site gives a sweeping 360° panorama of Darjeeling town and the Kanchenjunga range.',
    gallery: [
      'https://thumbs.dreamstime.com/b/poster-famous-batasia-loop-year-old-circular-train-track-encircled-spectacular-mountain-vista-most-picturesque-446553234.jpg',
      // Direct S3 original rather than the backpackersunited.in Next.js proxy,
      // which only serves its own origin.
      'https://bpu-images-v1.s3.eu-north-1.amazonaws.com/uploads/1721797693793_vineet-singh-GJ-hhgE-9tI-unsplash.jpg',
      'https://thewhistlestop.in/images/home_attractions.jpg',
    ],
    coords: [27.0163, 88.2586],
  },
  'Happy Valley Tea Estate': {
    about:
      'Founded in 1854, Happy Valley is the second-oldest tea estate in Darjeeling and the closest to the town centre. Its steep, mist-fed slopes produce prized first- and second-flush Darjeeling tea, still hand-plucked and processed in a Victorian-era factory. Guided walks through the gardens and factory end with a tasting of the estate’s single-origin brews.',
    // Origin scene7 image rather than the Brave search-cache copy, which is a
    // transient 860px-wide proxy.
    hero: 'https://s7ap1.scene7.com/is/image/incredibleindia/happy-valley-tea-estate-darjeeling-west%20bengal-darjeelin-1?qlt=82&ts=1726643146287',
    gallery: [
      'https://i.imgur.com/p3zhsGZ.jpg',
      'https://media-cdn.tripadvisor.com/media/photo-o/19/64/4c/b5/happy-valley-tea-estate.jpg',
      'https://www.darjeeling-tourism.com/darj_i00004c.jpg',
    ],
    coords: [27.055, 88.256],
  },
  'Padmaja Naidu Himalayan Zoological Park': {
    about:
      'India’s largest high-altitude zoo, opened in 1958 and set at around 2,130 m, specialises in breeding endangered Himalayan species. It runs internationally recognised conservation programmes for the red panda and snow leopard, and also houses Tibetan wolves, Himalayan black bears and the Himalayan Mountaineering Institute next door. Its terraced enclosures wind through natural pine forest.',
    gallery: [
      'https://hblimg.mmtcdn.com/content/hubble/img/darjeeling/mmt/activities/m_activities_Darjeeling_Padmaja%20Naidu%20Himalayan%20Zoological%20Park_l_400_640.jpg',
      'https://s7ap1.scene7.com/is/image/incredibleindia/padmaja-naidu-himalayan-zoological-park-darjeeling-west-bengal-1-attr-hero?qlt=82&ts=1726643354434',
      'https://captureatrip-cms-storage.s3.ap-south-1.amazonaws.com/Padmaja_Naidu_Himalayan_Zoological_Park_in_Summer_March_to_June_5a625ce2cf.webp',
    ],
    coords: [27.048, 88.257],
  },
  'Peace Pagoda': {
    about:
      'The Darjeeling Peace Pagoda, completed in 1992 on the slopes of Jalapahar, is one of many Nipponzan-Myōhōji stupas built worldwide to promote peace. Its white dome carries four gilded avatars of the Buddha, and the surrounding terrace offers a calm, panoramic view over the town and the mountains. A drum ceremony is held at the adjoining Japanese temple each morning and evening.',
    gallery: [
      'https://d3gw4aml0lneeh.cloudfront.net/assets/locations/13692/2o2gc2xlpijt.jpg',
      'https://superbcollections.com/wp-content/uploads/2023/09/Buddhist_Temple_Peace_Pagoda_Darjeeling_West_Bengal_India_5-600x800.jpg',
      'https://chalbanjare.com/crmnew/img_master/thumb/darjeeling-japanese-templejpgimgw12801280_17828148130.webp',
    ],
    coords: [27.0333, 88.2606],
  },
  'Ghum Monastery (Yiga Choeling)': {
    about:
      'Yiga Choeling, established in 1850 and rebuilt in 1909, is the oldest Tibetan Buddhist monastery of the Gelug (Yellow Hat) school in the Darjeeling area. It is best known for its 5 m statue of the Maitreya (Future) Buddha and a collection of rare handwritten Buddhist manuscripts and antique thangkas. Sitting near Ghum - one of the highest railway stations in the world - it remains an active place of worship.',
    gallery: [
      'https://d3gw4aml0lneeh.cloudfront.net/assets/locations/13712/Qn4fDURNCHPP.jpg',
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/09/61/c0/9d/yiga-choling-gompa.jpg?w=700&h=400&s=1',
      'https://media.istockphoto.com/id/2223969191/photo/beautiful-view-of-interior-of-ghum-monastery-image-taken-with-permission-peaceful-calm-and.jpg?s=612x612&w=0&k=20&c=O58kI1GMpxKf_xSq_3lPC1EpIBfoF4geCPLXWOAXyKs=',
    ],
    coords: [27.006, 88.254],
  },

  // ---------------- Homestays ----------------
  'Mist & Pine Homestay': {
    about:
      'A family-run home on the forested ridge of Lebong, wrapped in pine and often in the soft Darjeeling mist that gives it its name. Rooms are simple and warm, with wood interiors and hot water, and the day begins with home-cooked Nepali meals served with tea grown nearby. It sits a short drive from Darjeeling town yet feels a world away from it.',
    gallery: ['pine forest cottage', 'himalayan homestay interior', 'mountain cabin'],
    coords: [27.07, 88.262],
    personPhoto: 'nepali woman portrait smiling',
  },
  'Kanchenjunga View Retreat': {
    about:
      'Perched above Sonada between Darjeeling and Ghum, this retreat is built around one thing: an unobstructed view of the Kanchenjunga massif from every warm, wood-panelled room. Mornings here mean watching the peak light up with a cup of tea on the balcony. Meals are prepared from local produce and served family-style.',
    gallery: ['kanchenjunga view', 'himalayan lodge room', 'mountain view balcony'],
    coords: [26.987, 88.247],
    personPhoto: 'himalayan man portrait',
  },
  'Teahouse by the Garden': {
    about:
      'A stay set inside a working tea estate in Happy Valley, where the garden runs right up to the veranda. Guests wake to sunrise tea tastings on the balcony and can walk the plucking sections with the estate’s workers. The house blends colonial tea-bungalow character with the quiet routine of estate life.',
    gallery: ['tea estate bungalow', 'darjeeling tea garden', 'tea tasting'],
    coords: [27.055, 88.256],
    personPhoto: 'indian host portrait',
  },
  'Prayer Flag Cottage': {
    about:
      'A two-bedroom cottage near Ghum, strung with prayer flags and furnished with local textiles, thangkas and handwoven throws. Roomy enough for a family or a small group, it pairs a cultural, homely feel with easy access to Ghum Monastery and Batasia Loop. Home-cooked meals and endless tea come as standard.',
    gallery: ['prayer flags cottage', 'himalayan home interior', 'tibetan textiles'],
    coords: [27.006, 88.2545],
    personPhoto: 'nepali man portrait',
  },

  // ---------------- Drivers ----------------
  'Tenzing - Local Taxi Driver': {
    about:
      'Tenzing is a licensed local driver with years of experience guiding full-day sightseeing trips around Darjeeling. He knows the best timing for each viewpoint - when to leave for Tiger Hill, when the light is right at Batasia Loop - and speaks English, Nepali, Hindi and Bengali, so nothing gets lost along the way.',
    gallery: ['himalayan taxi', 'mountain road darjeeling', 'driver portrait'],
    routes: [
      'Full-day Darjeeling sightseeing: Tiger Hill → Batasia Loop → Ghum Monastery',
      'Darjeeling town ↔ Peace Pagoda & Japanese Temple',
      'Zoo, HMI & Ropeway circuit',
    ],
    personPhoto: 'nepali man portrait smiling',
  },
  'Karma - Sumo/SUV Driver': {
    about:
      'Karma runs a well-kept Tata Sumo/SUV built for larger groups and long-distance mountain routes. Reliable on the winding roads to Gangtok, Kalimpong and beyond, he’s a good choice for families or friends travelling together with luggage. Fuel and tolls are included in the day rate.',
    gallery: ['suv mountain road', 'himalayan highway', 'sikkim road trip'],
    routes: [
      'Darjeeling ↔ Gangtok (Sikkim)',
      'Darjeeling ↔ Kalimpong',
      'Darjeeling ↔ Pelling / Ravangla',
      'Multi-day Sikkim & hills tours',
    ],
    personPhoto: 'himalayan man driver portrait',
  },
  'Prakash - Airport/NJP Transfer': {
    about:
      'Prakash specialises in punctual airport and station transfers in a clean, comfortable sedan, with bottled water on board. He tracks arrivals so pickups from Bagdogra Airport and New Jalpaiguri (NJP) station stay on time even when flights and trains run late.',
    gallery: ['sedan car mountain', 'airport transfer', 'siliguri road'],
    routes: [
      'Bagdogra Airport (IXB) ↔ Darjeeling',
      'NJP Railway Station ↔ Darjeeling',
      'Siliguri ↔ Darjeeling',
    ],
    personPhoto: 'indian driver portrait',
  },

  // ---------------- Shops ----------------
  'Nathmulls Tea House': {
    about:
      'Founded in 1931, Nathmull’s is a Darjeeling institution stocking one of the widest selections of estate teas in the hills, from delicate first-flush to muscatel second-flush. The knowledgeable staff will brew and guide you through tastings before you buy.',
    gallery: ['darjeeling tea shop', 'tea tin selection', 'loose leaf tea'],
    coords: [27.0395, 88.263],
  },
  'Hayden Hall Craft Store': {
    about:
      'Hayden Hall is a social enterprise whose store sells handwoven shawls, bags and crafts made by local women’s cooperatives, with proceeds supporting community welfare programmes. Every piece is handmade in Darjeeling.',
    // Origin TripAdvisor media URLs rather than the Brave search-cache copies,
    // which are transient 860px-wide proxies.
    gallery: [
      'https://media-cdn.tripadvisor.com/media/photo-o/12/73/9d/7a/hayden-hall.jpg',
      'https://media-cdn.tripadvisor.com/media/photo-o/12/73/9d/8a/hayden-hall.jpg',
      'https://media-cdn.tripadvisor.com/media/photo-o/12/73/9d/6d/hayden-hall.jpg',
    ],
    coords: [27.0398, 88.2632],
  },
  'Gorkhey Haat': {
    about:
      'Gorkhey Haat (also known as Gorkha Haat) is a weekly open-air market in Darjeeling, typically held on Thursdays along HD Lama Road and JP Sharma Road in the heart of town.\n\n' +
      'Revived by the Gorkha Haat Samuha in 2024, it celebrates the traditional haat culture of the hills and serves as a social and economic hub for local artisans, farmers and vendors. It is best known for authentic regional cooking  momos filled with iskus and sisnu, sel roti, sekuwa, laphing, dhido and wachiba laphing  alongside handmade crafts, organic foods and herbal goods.\n\n' +
      'Note that it is distinct from Gorkhey, the remote Singalila village near the Sikkim border reachable only on foot; in town, "Gorkhey Haat" means this revived market tradition.',
    hero: 'https://miro.medium.com/v2/resize:fit:1100/format:webp/1*3FXYRuN6fc-JOVbhIDrJ2g.jpeg',
    gallery: [
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT8nOrCHL6lzQ41ls0fQoYLNl-LZlqL0HwRnLWBmwDjy1WoKu4rwV9yqsGP&s=10',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTFZSAYOgIq-9GoP3BV37QRoQlxTe3sigGOPt4_MspTIY86YndCyNjlkRf9&s=10',
      'https://miro.medium.com/v2/resize:fit:1400/1*sPXOjw_rDjYZIJdvmKpCAg.jpeg',
    ],
    coords: [27.0388, 88.2617],
  },

  // ---------------- Cafes ----------------
  "Sonam's Kitchen": {
    about:
      'A tiny, beloved breakfast spot where locals and travellers squeeze in for pancakes, fresh coffee and hearty plates. Arrive early - the wait is part of the ritual.',
    gallery: ['cozy cafe breakfast', 'pancakes coffee', 'himalayan cafe'],
    coords: [27.041, 88.2625],
  },
  "Glenary's Bakery & Cafe": {
    about:
      'A heritage colonial-era bakery on Nehru Road, Glenary’s is famous for fresh pastries, breads and a sit-down cafe with mountain views. Downstairs bakery, upstairs restaurant - both worth the stop.',
    gallery: ['heritage bakery', 'pastries cafe', 'darjeeling nehru road'],
    coords: [27.0405, 88.2645],
  },
  "Keventer's Rooftop": {
    about:
      'Serving since 1911, Keventer’s rooftop is an iconic Darjeeling breakfast institution known for its sausages, ham and sweeping views over Chowrasta and the hills beyond.',
    gallery: ['rooftop cafe mountains', 'breakfast platter', 'darjeeling town view'],
    coords: [27.0428, 88.2662],
  },

  // ---------------- Festivals ----------------
  'Darjeeling Carnival': {
    about:
      'The Darjeeling Carnival is an annual civic celebration of Gorkha identity and hill culture, born out of a movement to reclaim the town’s public spaces for the arts. Over roughly ten days it fills Chowrasta and the Mall with live music, folk and contemporary dance, food stalls and craft displays, drawing performers and visitors from across the Darjeeling hills.',
    gallery: ['gorkha cultural dance', 'himalayan festival music', 'nepali folk dance'],
    coords: [27.043, 88.266],
    bestTime: 'Mid-November to early December (roughly a ten-day run)',
  },
  'Losar - Tibetan New Year': {
    about:
      'Losar marks the Tibetan New Year and is celebrated at Darjeeling’s monasteries with masked Cham dances, butter-lamp offerings, special prayers and family feasting. The date shifts each year with the Tibetan lunar calendar, and Ghum Monastery is among the best places to witness the rituals.',
    gallery: ['losar tibetan festival', 'cham masked dance', 'monastery butter lamps'],
    coords: [27.006, 88.254],
    bestTime: 'February–March, set by the Tibetan lunar calendar',
  },
  'Tihar / Deepawali Festival': {
    about:
      'Tihar, the Gorkha festival of lights, runs over five days and honours crows, dogs, cows and finally siblings on Bhai Tika. Homes are lit with oil lamps and marigold garlands, and groups move door to door performing the traditional Deusi-Bhailo songs in exchange for blessings and treats.',
    gallery: ['diwali lights festival', 'oil lamps marigold', 'festival of lights india'],
    coords: [27.041, 88.263],
    bestTime: 'October–November, over five days around Diwali',
  },
  'Teesta Rangeet Tourism Festival': {
    about:
      'Named after the two rivers of the region, the Teesta Rangeet festival is a cultural and adventure showcase of the Darjeeling–Sikkim hills, mixing folk dance and music with food and outdoor activities. It runs across multiple venues in the hills.',
    gallery: ['himalayan river valley', 'cultural festival stage', 'adventure sports mountains'],
    coords: [27.041, 88.263],
    bestTime: 'December',
  },

  // ---------------- Biodiversity ----------------
  'Red Panda': {
    about:
      'The red panda (Ailurus fulgens) is Darjeeling’s state animal and one of the eastern Himalayas’ most iconic - and elusive - residents. Roughly cat-sized with rust-red fur and a ringed tail, it lives in temperate bamboo forests between about 2,200 and 4,800 m, feeding mainly on bamboo. Classified as Endangered, it is the focus of a dedicated captive-breeding and rewilding programme at the Padmaja Naidu Zoo.',
    gallery: ['red panda', 'red panda bamboo forest', 'red panda tree'],
    coords: [27.15, 88.0],
    spotted: ['Singalila National Park', 'Neora Valley National Park', 'Barsey Rhododendron Sanctuary', 'Padmaja Naidu Zoo (breeding centre)'],
  },
  'Himalayan Salamander': {
    about:
      'The Himalayan newt or salamander (Tylototriton verrucosus) is the only salamander native to India, found in a handful of high-altitude wetlands of the eastern Himalayas. Dark-bodied with warty skin and orange markings, it breeds in still pools during the monsoon and is highly sensitive to habitat loss, making its few known sites important to protect.',
    gallery: ['himalayan newt salamander', 'salamander wetland', 'amphibian pond'],
    coords: [27.1, 88.63],
    spotted: ['Namthing Pokhri', 'High-altitude wetlands near Lava & Kalimpong'],
  },
  'Rhododendron Forests': {
    about:
      'The Darjeeling and Sikkim hills hold one of the richest concentrations of rhododendron in the world, with dozens of species colouring the higher forests each spring. From the Singalila ridge to Senchal, the blooms range from scarlet tree-rhododendrons to delicate high-altitude shrubs, and they define the trek to Sandakphu in March and April.',
    gallery: ['rhododendron bloom himalaya', 'red rhododendron forest', 'singalila trek flowers'],
    coords: [27.15, 88.0],
    spotted: ['Singalila Ridge (Tonglu–Sandakphu)', 'Senchal Wildlife Sanctuary', 'Neora Valley'],
  },
  'Satyr Tragopan Pheasant': {
    about:
      'The satyr tragopan (Tragopan satyra) is a strikingly beautiful pheasant of the eastern Himalayan forests, the male deep crimson and spotted with white, with bright blue facial skin displayed during courtship. Shy and ground-dwelling, it favours dense undergrowth between about 2,400 and 4,200 m and is listed as globally Near Threatened.',
    gallery: ['satyr tragopan pheasant', 'himalayan pheasant bird', 'colourful pheasant'],
    coords: [26.98, 88.29],
    spotted: ['Senchal Wildlife Sanctuary', 'Singalila National Park', 'Neora Valley National Park'],
  },
};

/** Primary keyword used to fetch a listing's own photo. */
function primaryKeyword(item: any): string {
  const c = CONTENT[item?.title] || {};
  // Gallery entries may be real URLs; only a keyword can seed a stock search.
  const keyword = c.gallery?.find((g) => !/^https?:\/\//.test(g));
  if (keyword) return keyword;
  // No curated entry (e.g. a provider-created listing): build from its own data.
  return `${item?.title || ''} ${item?.location || 'Darjeeling'}`.trim();
}

/**
 * A distinct image for each listing. Keeps a genuine provider-uploaded image;
 * otherwise fetches a per-listing photo (unique keyword + per-title seed), so no
 * two listings share the same picture across cards and the detail hero.
 */
export function listingImage(item: any, w = 1200, h = 900): string {
  const curatedHero = CONTENT[item?.title]?.hero;
  if (curatedHero) return sizedImage(curatedHero, w);
  if (item?.image && !SEED_IMAGE_SET.has(item.image)) return sizedImage(item.image, w);
  return stockPhoto(primaryKeyword(item), w, h, seedFor(item?.title));
}

/**
 * The gallery photos for a listing, each distinct across listings. A gallery
 * entry may be a real photo URL - used as-is - or a keyword, which resolves to
 * a per-listing stock photo.
 */
export function galleryImagesFor(item: any, w = 900, h = 700): string[] {
  const c = CONTENT[item?.title] || {};
  const isUrl = (s: string) => /^https?:\/\//.test(s);

  // A type-wide photo set stands in unless this listing has its own real photos.
  const typeGallery = TYPE_GALLERY[item?.type];
  if (typeGallery && !c.gallery?.some(isUrl)) return typeGallery.map((u) => sizedImage(u, w));

  const base = seedFor(item?.title);
  return (c.gallery || []).map((entry, i) =>
    isUrl(entry) ? sizedImage(entry, w) : stockPhoto(entry, w, h, base + i + 1)
  );
}

/** Host / driver portrait, or undefined when there's no curated keyword. */
export function personImageFor(item: any, w = 600, h = 600): string | undefined {
  const c = CONTENT[item?.title] || {};
  if (!c.personPhoto) return undefined;
  return stockPhoto(c.personPhoto, w, h, seedFor(item?.title) + 91);
}

/** Content for a listing, with type-level fallbacks so every listing renders. */
export function contentFor(item: any): Required<Pick<ListingContent, 'about'>> & ListingContent {
  const c = CONTENT[item?.title] || {};
  // extras.routes set by provider takes priority over the static editorial map
  const routes: string[] | undefined =
    (item?.extras?.routes as string[] | undefined)?.length
      ? (item.extras.routes as string[])
      : c.routes;
  // Coordinates the provider pinned on the map win over the static editorial
  // entry, mirroring `routes` above. The listings API returns these as
  // top-level latitude/longitude; both must be present to be usable.
  const pinned: [number, number] | undefined =
    typeof item?.latitude === 'number' && typeof item?.longitude === 'number'
      ? [item.latitude, item.longitude]
      : undefined;
  return {
    about: c.about || item?.description || '',
    gallery: c.gallery,
    coords: pinned || c.coords || DARJEELING,
    bestTime: c.bestTime,
    routes,
    spotted: c.spotted,
    personPhoto: c.personPhoto,
  };
}
