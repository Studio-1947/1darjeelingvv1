import swaggerJsdoc from 'swagger-jsdoc';
import * as path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: '1 Darjeeling API',
      version: '1.0.0',
      description: 'REST API for the 1 Darjeeling tourism + local marketplace platform (auth, providers, listings, bookings, payments, admin).',
    },
    servers: [
      // Relative URL — resolves against whichever origin actually served
      // /api-docs, so "Try it out" hits the right host in both local dev
      // (http://localhost:8000) and production (https://<domain>) without
      // hardcoding either one.
      { url: '/api', description: 'Current host' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            phone: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['tourist', 'provider', 'admin'] },
            providerPaid: { type: 'boolean' },
            email: { type: 'string', nullable: true },
            language: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Provider: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            business_name: { type: 'string' },
            business_type: { type: 'string' },
            description: { type: 'string' },
            location: { type: 'string' },
            contact_phone: { type: 'string' },
            price_from: { type: 'integer' },
            images: { type: 'array', items: { type: 'string' } },
            extras: { type: 'object' },
            status: { type: 'string', enum: ['pending_payment', 'active', 'suspended'] },
            created_at: { type: 'string', format: 'date-time' },
            activated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Listing: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            type: { type: 'string', enum: ['spot', 'homestay', 'driver', 'shop', 'cafe', 'event', 'biodiversity'] },
            description: { type: 'string' },
            location: { type: 'string' },
            price: { type: 'integer' },
            image: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            provider_id: { type: 'string' },
            extras: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // A tourist spot is a Listing with type='spot' whose editorial fields live in
        // `extras`. Only an admin can create or edit one (see lib/spots.ts).
        SpotExtras: {
          type: 'object',
          properties: {
            images: { type: 'array', items: { type: 'string' }, description: 'Gallery photo URLs (max 16)' },
            highlights: { type: 'array', items: { type: 'string' }, description: 'Short "why go" bullets (max 12)' },
            best_time: { type: 'string' },
            timings: { type: 'string' },
            entry_fee: { type: 'string' },
            how_to_reach: { type: 'string' },
            altitude: { type: 'string' },
            address: { type: 'string' },
            published: { type: 'boolean', description: 'false keeps the spot a draft, hidden from all public reads' },
            featured: { type: 'boolean' },
            sort_order: { type: 'integer' },
          },
        },
        Spot: {
          allOf: [
            { $ref: '#/components/schemas/Listing' },
            {
              type: 'object',
              properties: {
                latitude: { type: 'number', nullable: true },
                longitude: { type: 'number', nullable: true },
                published: { type: 'boolean' },
                featured: { type: 'boolean' },
                sort_order: { type: 'integer' },
                review_count: { type: 'integer' },
                extras: { $ref: '#/components/schemas/SpotExtras' },
              },
            },
          ],
        },
        SpotInput: {
          type: 'object',
          required: ['title', 'description', 'location'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            location: { type: 'string' },
            latitude: { type: 'number', nullable: true },
            longitude: { type: 'number', nullable: true },
            price: { type: 'integer', description: 'Entry fee in rupees; 0 for free' },
            image: { type: 'string', description: 'Cover photo URL from /admin/spots/upload' },
            tags: { type: 'array', items: { type: 'string' } },
            extras: { $ref: '#/components/schemas/SpotExtras' },
          },
        },
        Booking: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            listing_id: { type: 'string' },
            listing_type: { type: 'string' },
            listing_title: { type: 'string' },
            check_in: { type: 'string', nullable: true },
            check_out: { type: 'string', nullable: true },
            guests: { type: 'integer' },
            notes: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['pending_payment', 'confirmed'] },
            created_at: { type: 'string', format: 'date-time' },
            confirmed_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Error: {
          type: 'object',
          properties: {
            detail: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [
    path.join(__dirname, 'routes/*.ts').replace(/\\/g, '/'),
    path.join(__dirname, 'routes/*.js').replace(/\\/g, '/'),
    path.join(__dirname, 'app.ts').replace(/\\/g, '/'),
    path.join(__dirname, 'app.js').replace(/\\/g, '/'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
