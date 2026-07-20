export const TEA_GARDEN = "https://images.pexels.com/photos/35151733/pexels-photo-35151733.jpeg";
export const TEA_PLANTATION = "https://images.pexels.com/photos/103875/pexels-photo-103875.jpeg";
export const HIMALAYA = "https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d";
export const RED_PANDA = "https://images.unsplash.com/photo-1542880941-1abfea46bba6";
export const CAFE = "https://images.pexels.com/photos/33932441/pexels-photo-33932441.png";

export interface SeedListing {
  title: string;
  type: string;
  description: string;
  location: string;
  price: number;
  image: string;
  tags: string[];
  extras?: Record<string, any>;
}

export const SEED_LISTINGS: SeedListing[] = [
    // -------- Tourism Spots --------
    { title: "Tiger Hill Sunrise", type: "spot", description: "Iconic sunrise viewpoint over Kanchenjunga. Best visited before dawn.", location: "Tiger Hill, Darjeeling", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784109903/tigerhill_mcmhxp.webp", tags: ["sunrise", "viewpoint", "iconic"] },
    { title: "Batasia Loop & War Memorial", type: "spot", description: "A scenic railway spiral surrounded by manicured gardens with a Gorkha war memorial.", location: "Ghum, Darjeeling", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784110354/batasia_loop_mgqcdr.webp", tags: ["heritage", "toy train", "garden"] },
    { title: "Happy Valley Tea Estate", type: "spot", description: "Second-oldest tea estate in Darjeeling. Tours & tastings available.", location: "Happy Valley, Darjeeling", price: 200, image: TEA_PLANTATION, tags: ["tea", "heritage", "tour"] },
    { title: "Padmaja Naidu Himalayan Zoological Park", type: "spot", description: "High-altitude zoo home to red pandas, snow leopards and Tibetan wolves.", location: "Jawahar Parbat, Darjeeling", price: 150, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784110479/zoo_pkf7ix.webp", tags: ["wildlife", "family", "conservation"] },
    { title: "Peace Pagoda", type: "spot", description: "A serene Japanese Buddhist stupa with panoramic views of the town.", location: "Jalapahar, Darjeeling", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784110742/peacepagoda_x1sjxb.webp", tags: ["spiritual", "views"] },
    { title: "Ghum Monastery (Yiga Choeling)", type: "spot", description: "Oldest Tibetan Buddhist monastery in the region, dating to 1850.", location: "Ghum, Darjeeling", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784110823/ghum_t1g6qm.webp", tags: ["monastery", "heritage"] },

    // -------- Homestays --------
    { title: "Mist & Pine Homestay", type: "homestay", description: "Cozy family-run stay overlooking pine forests. Traditional Nepali meals included.", location: "Lebong, Darjeeling", price: 1800, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784118976/mistpine_qc0xlt.webp", tags: ["family", "meals-included", "forest"] },
    { title: "Kanchenjunga View Retreat", type: "homestay", description: "Wake up to unobstructed mountain views. Warm rooms with wooden interiors.", location: "Sonada, Darjeeling", price: 2400, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784118977/kanchenjungaview_ljomty.webp", tags: ["mountain-view", "peaceful"] },
    { title: "Teahouse by the Garden", type: "homestay", description: "Stay inside a working tea estate. Sunrise tea tastings on the balcony.", location: "Happy Valley, Darjeeling", price: 3200, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784118979/teahouse_yybhxk.webp", tags: ["tea-estate", "experience"] },
    { title: "Prayer Flag Cottage", type: "homestay", description: "Two-bedroom cottage decorated with local textiles and prayer flags. Great for groups.", location: "Ghum, Darjeeling", price: 2100, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784118976/prayerflag_jx34w5.webp", tags: ["group", "cultural"] },

    // -------- Drivers --------
    { title: "Tenzing - Local Taxi Driver", type: "driver", description: "Experienced local driver for full-day sightseeing. Speaks English, Nepali, Hindi, Bengali.", location: "Darjeeling Town", price: 2500, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784115417/tenzing_ttsbl8.webp", tags: ["sightseeing", "multi-lingual", "full-day"] },
    { title: "Karma - Sumo/SUV Driver", type: "driver", description: "Reliable Sumo for larger groups & long-distance trips to Gangtok, Kalimpong.", location: "Chowk Bazaar, Darjeeling", price: 3500, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784115417/karma_lyol4t.webp", tags: ["group", "long-distance"] },
    { title: "Prakash - Airport/NJP Transfer", type: "driver", description: "Punctual pickup from Bagdogra & NJP. Bottled water and clean sedan.", location: "Darjeeling", price: 3200, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784115416/prakash_vmpj0x.webp", tags: ["transfer", "airport"] },

    // -------- Local Shops --------
    { title: "Nathmulls Tea House", type: "shop", description: "Legendary tea shop with the finest first-flush Darjeeling teas since 1931.", location: "Laden La Road, Darjeeling", price: 400, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784201627/nathmulls_kecous.webp", tags: ["tea", "gifts", "heritage"] },
    { title: "Hayden Hall Craft Store", type: "shop", description: "Handwoven shawls and crafts made by local women's cooperatives.", location: "Laden La Road, Darjeeling", price: 800, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784201631/hayden_ianxfd.webp", tags: ["crafts", "handwoven", "cooperative"] },
    { title: "Life & Leaf Wooden Toys", type: "shop", description: "Local artisan wooden toys, magnets, and prayer wheels.", location: "Chowrasta, Darjeeling", price: 250, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784201408/woodentoys_f8vdhz.webp", tags: ["souvenirs", "artisan"] },

    // -------- Cafes --------
    { title: "Sonam's Kitchen", type: "cafe", description: "Breakfast institution loved by locals & travellers. Try the pancakes.", location: "Dr. Zakir Hussain Road, Darjeeling", price: 300, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784111263/sonamkitchen_tkkacn.webp", tags: ["breakfast", "cozy"] },
    { title: "Glenary's Bakery & Cafe", type: "cafe", description: "Heritage colonial-era bakery. Fresh pastries and hearty meals.", location: "Nehru Road, Darjeeling", price: 500, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784111263/glenarys_fmy1k3.webp", tags: ["bakery", "heritage"] },
    { title: "Keventer's Rooftop", type: "cafe", description: "Iconic rooftop breakfast spot since 1911.", location: "Nehru Road, Darjeeling", price: 450, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784111263/keventers_zwibyf.webp", tags: ["breakfast", "iconic"] },

    // -------- Cultural Events --------
    { title: "Darjeeling Carnival", type: "event", description: "Annual celebration of Gorkha culture with music, dance and food stalls.", location: "Chowrasta Mall Road", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784112327/meloteafest_hxp4my.webp", tags: ["festival", "music", "gorkha"], extras: { month: "November" } },
    { title: "Losar - Tibetan New Year", type: "event", description: "Traditional Tibetan New Year celebrations at local monasteries.", location: "Ghum Monastery", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784112327/losar_omcdmh.webp", tags: ["tibetan", "spiritual"], extras: { month: "February/March" } },
    { title: "Tihar / Deepawali Festival", type: "event", description: "Five-day festival of lights with Deusi-Bhailo song traditions.", location: "Across Darjeeling", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784112327/dasai_gy8yoo.webp", tags: ["festival", "lights"], extras: { month: "October/November" } },
    { title: "Teesta Rangeet Tourism Festival", type: "event", description: "Cultural showcase of the hills — folk dance, adventure and food.", location: "Darjeeling & Sikkim", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784195367/carnival_xc1av7.webp", tags: ["cultural", "adventure"], extras: { month: "December" } },

    // -------- Biodiversity --------
    { title: "Red Panda", type: "biodiversity", description: "Darjeeling's state animal. Elusive and endangered — spotted in Singalila NP.", location: "Singalila National Park", price: 0, image: RED_PANDA, tags: ["endangered", "state-animal"] },
    { title: "Himalayan Salamander", type: "biodiversity", description: "Rare amphibian found only in the eastern Himalayas.", location: "Namthing Pokhri", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784195367/himalayansalamander_extbzc.webp", tags: ["endemic", "amphibian"] },
    { title: "Rhododendron Forests", type: "biodiversity", description: "36+ species of rhododendron bloom across the hills every spring.", location: "Singalila & Senchal", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784195367/rhododendron_d3mvjk.webp", tags: ["flora", "spring"] },
    { title: "Satyr Tragopan Pheasant", type: "biodiversity", description: "A vulnerable pheasant with stunning red plumage native to these forests.", location: "Senchal Wildlife Sanctuary", price: 0, image: "https://res.cloudinary.com/drgb8w8ak/image/upload/v1784195366/Satyrtragopanpheasant_g7fyxn.webp", tags: ["birdlife", "vulnerable"] },
];
