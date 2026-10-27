import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { normaliseVehicleNumber } from '../src/lib/vehicleNumber';
import { registerUser } from './helpers';

describe('normaliseVehicleNumber', () => {
  it('accepts ordinary plates in any spacing or case', () => {
    expect(normaliseVehicleNumber('WB 74 A 1234')).toBe('WB74A1234');
    expect(normaliseVehicleNumber('wb74a1234')).toBe('WB74A1234');
    expect(normaliseVehicleNumber('WB-74-A-1234')).toBe('WB74A1234');
    expect(normaliseVehicleNumber(' SK 01 J 5678 ')).toBe('SK01J5678');
    expect(normaliseVehicleNumber('WB 76 1234')).toBe('WB761234');
    expect(normaliseVehicleNumber('WB 73 AB 0042')).toBe('WB73AB0042');
  });

  it('accepts the Bharat series', () => {
    expect(normaliseVehicleNumber('22 BH 1234 AA')).toBe('22BH1234AA');
  });

  it('rejects fragments, nonsense and non-strings', () => {
    for (const bad of ['', '   ', 'WB74', 'WB 74 A', '1234', 'HELLO WORLD', 'WB74A12345678', '74 WB A 1234', 'WB 74 A 12 34 56']) {
      expect(normaliseVehicleNumber(bad)).toBeNull();
    }
    expect(normaliseVehicleNumber(undefined)).toBeNull();
    expect(normaliseVehicleNumber(1234567890)).toBeNull();
    expect(normaliseVehicleNumber({})).toBeNull();
  });
});

describe('driver onboarding with a vehicle', () => {
  async function onboard(token: string, phone: string, businessType: string, extras: Record<string, unknown>) {
    return request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send({
        business_name: 'Vehicle Test Jeeps',
        business_type: businessType,
        description: 'Shared jeep between NJP and Darjeeling',
        location: 'NJP Station',
        contact_phone: phone,
        extras,
      });
  }

  it('stores the plate in one canonical form, plus the vehicle type', async () => {
    const { token, phone } = await registerUser({ name: 'Plate Driver', role: 'provider' });
    const res = await onboard(token, phone, 'driver', { vehicle: '  Mahindra Bolero, 7 seats ', vehicle_number: 'wb 74 a 1234' });
    expect(res.status).toBe(200);
    expect(res.body.provider.extras.vehicle_number).toBe('WB74A1234');
    expect(res.body.provider.extras.vehicle).toBe('Mahindra Bolero, 7 seats');
  });

  it('refuses a plate that does not look like one, and an over-long vehicle name', async () => {
    const { token, phone } = await registerUser({ name: 'Bad Plate', role: 'provider' });
    const bad = await onboard(token, phone, 'driver', { vehicle_number: 'HELLO' });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toMatch(/number plate/i);

    const long = await onboard(token, phone, 'driver', { vehicle: 'x'.repeat(61) });
    expect(long.status).toBe(400);
  });

  it('still onboards a driver who gives no vehicle details, as older apps do', async () => {
    const { token, phone } = await registerUser({ name: 'No Plate', role: 'provider' });
    const res = await onboard(token, phone, 'driver', {});
    expect(res.status).toBe(200);
    expect(res.body.provider.extras.vehicle_number).toBeUndefined();
  });

  it('drops vehicle fields sent by a business that is not a driver', async () => {
    const { token, phone } = await registerUser({ name: 'Not A Driver', role: 'provider' });
    const res = await onboard(token, phone, 'homestay', { vehicle_number: 'WB74A1234', vehicle: 'Jeep', upi: 'x@y' });
    expect(res.status).toBe(200);
    expect(res.body.provider.extras.vehicle_number).toBeUndefined();
    expect(res.body.provider.extras.vehicle).toBeUndefined();
    expect(res.body.provider.extras.upi).toBe('x@y');
  });

  it('carries the vehicle onto the first listing once the registration is paid', async () => {
    const { token, phone } = await registerUser({ name: 'Listing Driver', role: 'provider' });
    const res = await onboard(token, phone, 'driver', { vehicle: 'Maruti Ertiga', vehicle_number: 'WB 76 C 4321' });
    const providerId = res.body.provider.id as string;

    const order = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
      .send({ flow: 'provider_registration', reference_id: providerId });
    await request(app).post('/api/payments/mock/complete').set('Authorization', `Bearer ${token}`)
      .send({ order_id: order.body.order.id, flow: 'provider_registration', reference_id: providerId });

    const mine = await request(app).get('/api/bookings/provider').set('Authorization', `Bearer ${token}`);
    const listing = mine.body.listings.find((l: any) => l.type === 'driver');
    expect(listing).toBeDefined();
    expect(listing.extras.vehicle_number).toBe('WB76C4321');
    expect(listing.extras.vehicle).toBe('Maruti Ertiga');
  });
});
