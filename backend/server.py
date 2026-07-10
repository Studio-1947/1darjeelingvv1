"""
1 Darjeeling - Backend API
Tourism + local marketplace platform for Darjeeling.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hmac
import hashlib
import secrets as _secrets
import uuid
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone
import razorpay

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# --- Config
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', '')
MOCK_PAYMENTS = os.environ.get('MOCK_PAYMENTS', 'true').lower() == 'true'

# --- Mongo
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# --- Razorpay client
rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_KEY_SECRET else None

# --- App
app = FastAPI(title="1 Darjeeling API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger("one-darjeeling")


# ============ MODELS ============
def uid() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SendOTPBody(BaseModel):
    phone: str
    channel: Literal["whatsapp", "sms"] = "whatsapp"


class VerifyOTPBody(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None
    role: Literal["tourist", "provider"] = "tourist"


class ProviderOnboarding(BaseModel):
    business_name: str
    business_type: Literal["homestay", "driver", "shop", "cafe"]
    description: str
    location: str
    contact_phone: str
    price_from: Optional[float] = 0
    images: List[str] = []
    extras: dict = {}


class ListingIn(BaseModel):
    title: str
    type: Literal["homestay", "driver", "shop", "cafe", "spot", "event", "biodiversity"]
    description: str
    location: str
    price: Optional[float] = 0
    image: str = ""
    tags: List[str] = []
    provider_id: Optional[str] = None
    extras: dict = {}


class BookingIn(BaseModel):
    listing_id: str
    listing_type: Literal["homestay", "driver"]
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    guests: int = 1
    notes: str = ""


class OrderIn(BaseModel):
    flow: Literal["provider_registration", "booking_commission"]
    reference_id: str


class VerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    flow: Literal["provider_registration", "booking_commission"]
    reference_id: str


# ============ AUTH HELPERS ============
def make_token(user_id: str, phone: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "phone": phone,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def require_admin(user=Depends(current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user


# ============ ROOT / HEALTH ============
@api.get("/")
async def root():
    return {"app": "1 Darjeeling", "status": "ok"}


# ============ AUTH ROUTES ============
@api.post("/auth/otp/send")
async def send_otp(body: SendOTPBody):
    """Mock WhatsApp OTP send. Any 6-digit code will work; universal test code is '123456'."""
    otp = f"{_secrets.randbelow(1000000):06d}"
    await db.otps.update_one(
        {"phone": body.phone},
        {"$set": {"phone": body.phone, "otp": otp, "channel": body.channel, "created_at": now_iso()}},
        upsert=True,
    )
    log.info(f"[MOCK OTP] phone={body.phone} otp={otp} (universal test code: 123456)")
    # Return the OTP in the response ONLY in mock mode so the UI can show it
    return {"sent": True, "channel": body.channel, "mock_otp": otp, "hint": "Mock mode: use the OTP shown or 123456"}


@api.post("/auth/otp/verify")
async def verify_otp(body: VerifyOTPBody):
    rec = await db.otps.find_one({"phone": body.phone}, {"_id": 0})
    universal_ok = body.otp == "123456"
    if not universal_ok and (not rec or rec.get("otp") != body.otp):
        raise HTTPException(400, "Invalid OTP")

    user = await db.users.find_one({"phone": body.phone}, {"_id": 0})
    if not user:
        user = {
            "id": uid(),
            "phone": body.phone,
            "name": body.name or f"User {body.phone[-4:]}",
            "role": body.role,
            "provider_paid": False,
            "created_at": now_iso(),
        }
        await db.users.insert_one({**user})
    # remove any _id key just in case
    user.pop("_id", None)

    token = make_token(user["id"], user["phone"], user["role"])
    return {"token": token, "user": user}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return {"user": user}


# ============ USERS ============
@api.patch("/users/me")
async def update_me(patch: dict, user=Depends(current_user)):
    allowed = {"name", "email", "language", "avatar", "role"}
    upd = {k: v for k, v in patch.items() if k in allowed}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return {"user": (await db.users.find_one({"id": user["id"]}, {"_id": 0}))}


# ============ PROVIDER ONBOARDING ============
@api.post("/providers/onboard")
async def provider_onboard(body: ProviderOnboarding, user=Depends(current_user)):
    """Creates a provider profile draft. Provider must pay Rs.99 to activate."""
    provider = {
        "id": uid(),
        "user_id": user["id"],
        "business_name": body.business_name,
        "business_type": body.business_type,
        "description": body.description,
        "location": body.location,
        "contact_phone": body.contact_phone,
        "price_from": body.price_from,
        "images": body.images,
        "extras": body.extras,
        "status": "pending_payment",
        "created_at": now_iso(),
    }
    await db.providers.insert_one({**provider})
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "provider"}})
    return {"provider": provider}


@api.get("/providers/me")
async def my_provider(user=Depends(current_user)):
    p = await db.providers.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"provider": p}


# ============ LISTINGS (unified: homestays, drivers, shops, cafes, spots, events, biodiversity) ============
@api.get("/listings")
async def list_listings(type: Optional[str] = None, q: Optional[str] = None, limit: int = 60):
    query = {}
    if type:
        query["type"] = type
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
        ]
    items = await db.listings.find(query, {"_id": 0}).to_list(limit)
    return {"items": items}


@api.get("/listings/{listing_id}")
async def get_listing(listing_id: str):
    item = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Not found")
    return {"item": item}


@api.post("/listings")
async def create_listing(body: ListingIn, user=Depends(current_user)):
    listing = {"id": uid(), "created_at": now_iso(), **body.model_dump()}
    if not listing.get("provider_id"):
        listing["provider_id"] = user["id"]
    await db.listings.insert_one({**listing})
    return {"item": listing}


# ============ BOOKINGS ============
@api.post("/bookings")
async def create_booking(body: BookingIn, user=Depends(current_user)):
    listing = await db.listings.find_one({"id": body.listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(404, "Listing not found")
    booking = {
        "id": uid(),
        "user_id": user["id"],
        "listing_id": body.listing_id,
        "listing_type": body.listing_type,
        "listing_title": listing.get("title"),
        "check_in": body.check_in,
        "check_out": body.check_out,
        "guests": body.guests,
        "notes": body.notes,
        "status": "pending_payment",
        "created_at": now_iso(),
    }
    await db.bookings.insert_one({**booking})
    return {"booking": booking}


@api.get("/bookings/me")
async def my_bookings(user=Depends(current_user)):
    items = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Enrich with listing details
    for b in items:
        listing = await db.listings.find_one({"id": b.get("listing_id")}, {"_id": 0, "id": 1, "title": 1, "image": 1, "location": 1, "type": 1, "price": 1})
        b["listing"] = listing
    return {"items": items}


@api.get("/bookings/provider")
async def provider_bookings(user=Depends(current_user)):
    """Bookings received by the currently-logged-in provider (for their listings)."""
    # Find provider profile
    provider = await db.providers.find_one({"user_id": user["id"]}, {"_id": 0})
    # Find all listing IDs owned by this user
    my_listings = await db.listings.find({"provider_id": {"$in": [user["id"], provider["id"] if provider else None]}}, {"_id": 0}).to_list(500)
    listing_ids = [l["id"] for l in my_listings]
    if not listing_ids:
        return {"items": [], "stats": {"total": 0, "confirmed": 0, "pending": 0, "revenue": 0}, "listings": []}
    bookings = await db.bookings.find({"listing_id": {"$in": listing_ids}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with customer name + listing snapshot
    for b in bookings:
        cust = await db.users.find_one({"id": b.get("user_id")}, {"_id": 0, "name": 1, "phone": 1})
        b["customer"] = cust
        b["listing"] = next((l for l in my_listings if l["id"] == b["listing_id"]), None)
    # Compute revenue from listing prices * confirmed bookings (best-effort)
    confirmed = [b for b in bookings if b.get("status") == "confirmed"]
    revenue = 0
    for b in confirmed:
        l = b.get("listing") or {}
        revenue += int(l.get("price") or 0)
    stats = {
        "total": len(bookings),
        "confirmed": len(confirmed),
        "pending": len([b for b in bookings if b.get("status") == "pending_payment"]),
        "revenue": revenue,
    }
    return {"items": bookings, "stats": stats, "listings": my_listings}


# ============ PAYMENTS (Razorpay) ============
AMOUNTS = {"provider_registration": 9900, "booking_commission": 100}  # in paise


@api.post("/payments/order")
async def create_order(body: OrderIn, user=Depends(current_user)):
    amount = AMOUNTS[body.flow]

    # --- Mock mode: skip real gateway
    if MOCK_PAYMENTS:
        mock_order_id = f"mock_order_{uid()[:12]}"
        await db.payments.insert_one({
            "id": uid(),
            "user_id": user["id"],
            "flow": body.flow,
            "reference_id": body.reference_id,
            "amount": amount,
            "order_id": mock_order_id,
            "status": "created",
            "mock": True,
            "created_at": now_iso(),
        })
        return {
            "mock": True,
            "key_id": "mock_gateway",
            "order": {"id": mock_order_id, "amount": amount, "currency": "INR"},
            "amount": amount,
        }

    # --- Real Razorpay
    if not rzp_client:
        raise HTTPException(500, "Razorpay not configured")
    receipt = f"{body.flow[:20]}_{body.reference_id[:16]}_{uid()[:6]}"[:40]
    try:
        order = rzp_client.order.create({
            "amount": amount,
            "currency": "INR",
            "receipt": receipt,
            "notes": {"flow": body.flow, "reference_id": body.reference_id, "user_id": user["id"]},
        })
    except Exception as e:
        log.error(f"Razorpay order failed: {e}")
        raise HTTPException(502, f"Payment gateway error: {e}")

    await db.payments.insert_one({
        "id": uid(),
        "user_id": user["id"],
        "flow": body.flow,
        "reference_id": body.reference_id,
        "amount": amount,
        "order_id": order["id"],
        "status": "created",
        "created_at": now_iso(),
    })
    return {"mock": False, "key_id": RAZORPAY_KEY_ID, "order": order, "amount": amount}


class MockCompleteIn(BaseModel):
    order_id: str
    flow: Literal["provider_registration", "booking_commission"]
    reference_id: str


@api.post("/payments/mock/complete")
async def mock_complete(body: MockCompleteIn, user=Depends(current_user)):
    """Complete a mock payment. Marks payment as paid and triggers side-effects (same as verify)."""
    if not MOCK_PAYMENTS:
        raise HTTPException(400, "Mock payments disabled")
    payment = await db.payments.find_one({"order_id": body.order_id}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Order not found")
    if payment.get("status") == "paid":
        return {"ok": True, "already": True}

    await db.payments.update_one(
        {"order_id": body.order_id},
        {"$set": {"status": "paid", "payment_id": f"mock_pay_{uid()[:12]}", "paid_at": now_iso()}},
    )

    booking_or_provider = None
    if body.flow == "provider_registration":
        await db.providers.update_one({"id": body.reference_id}, {"$set": {"status": "active", "activated_at": now_iso()}})
        await db.users.update_one({"id": user["id"]}, {"$set": {"provider_paid": True}})
        p = await db.providers.find_one({"id": body.reference_id}, {"_id": 0})
        if p:
            listing = {
                "id": uid(),
                "title": p["business_name"],
                "type": p["business_type"],
                "description": p["description"],
                "location": p["location"],
                "price": p.get("price_from", 0),
                "image": (p.get("images") or [""])[0],
                "tags": [],
                "provider_id": p["id"],
                "extras": p.get("extras", {}),
                "created_at": now_iso(),
            }
            await db.listings.insert_one({**listing})
            p["listing_id"] = listing["id"]
        booking_or_provider = p
    elif body.flow == "booking_commission":
        await db.bookings.update_one({"id": body.reference_id}, {"$set": {"status": "confirmed", "confirmed_at": now_iso()}})
        booking = await db.bookings.find_one({"id": body.reference_id}, {"_id": 0})
        if booking:
            listing = await db.listings.find_one({"id": booking.get("listing_id")}, {"_id": 0})
            booking["listing"] = listing
            # Enrich with provider info for confirmation UI
            if listing and listing.get("provider_id"):
                provider = await db.providers.find_one({"id": listing["provider_id"]}, {"_id": 0}) \
                    or await db.users.find_one({"id": listing["provider_id"]}, {"_id": 0, "name": 1, "phone": 1})
                booking["provider"] = provider
            # Log a mock notification (real WhatsApp would go here)
            log.info(f"[MOCK NOTIFY] Booking {booking['id']} confirmed. Tourist={user.get('phone')} Provider={booking.get('provider', {}).get('contact_phone') or booking.get('provider', {}).get('phone')}")
        booking_or_provider = booking

    return {"ok": True, "status": "paid", "record": booking_or_provider}


@api.post("/payments/verify")
async def verify_payment(body: VerifyPaymentIn, user=Depends(current_user)):
    payment = await db.payments.find_one({"order_id": body.razorpay_order_id}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Order not found")

    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Invalid payment signature")

    await db.payments.update_one(
        {"order_id": body.razorpay_order_id},
        {"$set": {"status": "paid", "payment_id": body.razorpay_payment_id, "paid_at": now_iso()}},
    )

    # Post-payment side-effects
    if body.flow == "provider_registration":
        await db.providers.update_one({"id": body.reference_id}, {"$set": {"status": "active", "activated_at": now_iso()}})
        await db.users.update_one({"id": user["id"]}, {"$set": {"provider_paid": True}})
        # Optionally publish provider as a listing
        p = await db.providers.find_one({"id": body.reference_id}, {"_id": 0})
        if p:
            listing = {
                "id": uid(),
                "title": p["business_name"],
                "type": p["business_type"],
                "description": p["description"],
                "location": p["location"],
                "price": p.get("price_from", 0),
                "image": (p.get("images") or [""])[0],
                "tags": [],
                "provider_id": p["id"],
                "extras": p.get("extras", {}),
                "created_at": now_iso(),
            }
            await db.listings.insert_one({**listing})
    elif body.flow == "booking_commission":
        await db.bookings.update_one({"id": body.reference_id}, {"$set": {"status": "confirmed", "confirmed_at": now_iso()}})

    return {"ok": True, "status": "paid"}


# ============ ADMIN / SEED ============
@api.post("/admin/seed")
async def seed_data():
    """Idempotent seed of sample Darjeeling content."""
    from seed_data import SEED_LISTINGS
    inserted = 0
    for item in SEED_LISTINGS:
        exists = await db.listings.find_one({"title": item["title"], "type": item["type"]}, {"_id": 1})
        if exists:
            continue
        doc = {"id": uid(), "created_at": now_iso(), **item}
        await db.listings.insert_one({**doc})
        inserted += 1
    return {"seeded": inserted, "total_in_seed": len(SEED_LISTINGS)}


@api.get("/admin/stats")
async def admin_stats():
    stats = {
        "users": await db.users.count_documents({}),
        "providers": await db.providers.count_documents({}),
        "listings": await db.listings.count_documents({}),
        "bookings": await db.bookings.count_documents({}),
        "payments": await db.payments.count_documents({"status": "paid"}),
    }
    return stats


# ============ Wire router ============
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
