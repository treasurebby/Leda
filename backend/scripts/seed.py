"""Seed a dev database with the demo data the frontend currently hard-codes, so the UI numbers reproduce.

    uv run scripts/seed.py            # creates owner ada@leda.africa / password "Leda demo 1"

Safe to re-run: skips if the owner already exists.
"""

import asyncio
import sys
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.db import SessionLocal, utcnow  # noqa: E402
from app.models import (  # noqa: E402
    Channel,
    Evidence,
    EvidenceKind,
    Flag,
    FlagKind,
    Notification,
    Order,
    OrderLine,
    OrderStatus,
    Product,
    Retailer,
    RetailerTier,
    ReviewState,
    User,
)
from app.schemas.auth import RegisterRequest  # noqa: E402
from app.services import ledger as ledger_svc  # noqa: E402
from app.services import orders as order_svc  # noqa: E402
from app.services.auth import register_owner  # noqa: E402
from app.services.reconcile import record_credit  # noqa: E402

OWNER_EMAIL = "ada@leda.africa"
OWNER_PASSWORD = "Leda demo 1"

PRODUCTS = [
    ("RSR-50", "Royal Stallion Parboiled Rice", "Bag 50kg", "78500", 126, 60, 40, ["royal", "stallion"]),
    ("MGR-50", "Mama Gold Premium Rice", "Bag 50kg", "77200", 43, 55, 25, ["mama gold"]),
    ("KVO-25R", "Kings Vegetable Oil", "Keg 25L", "96500", 18, 35, 15, ["the yellow one", "kings"]),
    ("FSL-25", "Fortune Soya Oil", "Keg 25L", "91000", 67, 30, 0, ["the yellow one", "fortune"]),
    ("SUG-50", "Dangote Granulated Sugar", "Bag 50kg", "72000", 31, 40, 12, ["sugar"]),
    ("NOD-70", "Golden Penny Noodles", "Carton 70", "30000", 205, 80, 20, ["noodles", "indomie"]),
]

RETAILERS = [
    ("Madam Kike Stores", "Trade Fair Complex, Lagos", "+2348034051198", "7 day credit", RetailerTier.gold),
    ("Okafor Provisions", "Onitsha Main Market", "+2348052016042", "Cash on delivery", RetailerTier.gold),
    ("Amina Food Mart", "Kantin Kwari, Kano", "+2347065490211", "14 day credit", RetailerTier.silver),
    ("Emeka Beverages Ltd", "Ariaria, Aba", "+2348038823048", "7 day credit", RetailerTier.gold),
    ("Bola & Sons", "Oyingbo, Lagos", "+2348056107789", "Cash on delivery", RetailerTier.silver),
    ("Alhaji Musa Grains", "Kantin Kwari, Kano", "+2348020443288", "7 day credit", RetailerTier.standard),
    ("Yetunde Electronics", "Alaba International", "+2348011223344", "Cash on delivery", RetailerTier.silver),
    ("Idris Supermarket", "Wuse Market, Abuja", "+2348099887766", "7 day credit", RetailerTier.silver),
]

# (number, retailer, channel, hours_ago, status, lines[(sku, qty)], pay: matched | review | None)
ORDERS = [
    (1035, "Idris Supermarket", Channel.voice, 26, "paid", [("RSR-50", 22), ("NOD-70", 2)], "matched"),
    (1036, "Yetunde Electronics", Channel.text, 25, "paid", [("KVO-25R", 15)], "matched"),
    (1037, "Alhaji Musa Grains", Channel.photo, 3, "needs_review", [("MGR-50", 34)], None),
    (1038, "Emeka Beverages Ltd", Channel.voice, 2.5, "pending", [("FSL-25", 30), ("SUG-50", 5)], "review"),
    (1039, "Bola & Sons", Channel.photo, 2.2, "processing", [("NOD-70", 18)], None),
    (1040, "Amina Food Mart", Channel.text, 1.8, "paid", [("RSR-50", 20), ("SUG-50", 6)], "matched"),
    (
        1041,
        "Okafor Provisions",
        Channel.voice,
        1.3,
        "needs_review",
        [("RSR-50", 40), ("MGR-50", 25), ("KVO-25R", 15)],
        None,
    ),
    (1042, "Madam Kike Stores", Channel.voice, 1.0, "paid", [("RSR-50", 60), ("KVO-25R", 20)], "matched"),
]


async def main() -> None:
    async with SessionLocal() as db:
        if await db.scalar(select(User).where(User.email == OWNER_EMAIL)):
            print(f"{OWNER_EMAIL} already exists; nothing to do.")
            return
        user, business = await register_owner(
            db,
            RegisterRequest(
                full_name="Ada Okafor",
                phone="08034051198",
                email=OWNER_EMAIL,
                password=OWNER_PASSWORD,
                business_name="Okafor Distribution",
                industry="Foodstuff & groceries",
            ),
        )
        business.next_order_number = 1035
        products = {}
        for sku, name, unit, price, stock, reorder, reserved, aliases in PRODUCTS:
            p = Product(
                business_id=business.id,
                sku=sku,
                name=name,
                unit=unit,
                price=Decimal(price),
                stock=stock,
                reorder_level=reorder,
                reserved=reserved,
                aliases=aliases,
            )
            db.add(p)
            products[sku] = p
        retailers = {}
        for i, (name, market, phone, terms, tier) in enumerate(RETAILERS, start=1):
            r = Retailer(
                business_id=business.id,
                name=name,
                market=market,
                phone=phone,
                terms=terms,
                tier=tier,
                dva_account_number=f"99{i:08d}",
                dva_bank="Test Bank",
                account_reference=f"99{i:08d}",
            )
            db.add(r)
            retailers[name] = r
        await db.flush()

        for number, retailer_name, channel, hours_ago, status, lines, pay in ORDERS:
            r = retailers[retailer_name]
            created = utcnow() - timedelta(hours=hours_ago)
            order = Order(
                business_id=business.id,
                number=f"LE-{number}",
                retailer_id=r.id,
                channel=channel,
                owner_user_id=user.id,
                lines=[],
                flags=[],
                evidence=[],
                created_at=created,
                updated_at=created,
            )
            db.add(order)
            await db.flush()
            for pos, (sku, qty) in enumerate(lines):
                p = products[sku]
                order.lines.append(
                    OrderLine(
                        order_id=order.id,
                        position=pos,
                        product_id=p.id,
                        product_name=p.name,
                        sku=p.sku,
                        unit=p.unit,
                        quantity=qty,
                        unit_price=p.price,
                        confidence_score=97,
                        review_state=ReviewState.sure,
                    )
                )
            if number == 1041:
                order.evidence.append(
                    Evidence(
                        order_id=order.id,
                        kind=EvidenceKind.transcript,
                        text="Send me like fifty bags of Royal Stallion, make e remain small. "
                        "Twenty-five Mama Gold. Add fifteen kegs of the yellow one.",
                    )
                )
                order.lines[0].confidence_score, order.lines[0].review_state = 54, ReviewState.check
                order.lines[2].confidence_score, order.lines[2].review_state = 71, ReviewState.check
                await db.flush()
                order.flags.append(
                    Flag(
                        order_id=order.id,
                        line_id=order.lines[0].id,
                        kind=FlagKind.voice,
                        issue="Quantity unclear (54% confidence)",
                        quote="Send me like fifty, make e remain small.",
                        why="'Like fifty' with 'make e remain small' could mean 50 bags or 55 bags. "
                        "The difference is ₦392,500.",
                        options=[
                            {"label": "50 bags of Royal Stallion 50kg", "quantity": 50},
                            {"label": "55 bags of Royal Stallion 50kg", "quantity": 55},
                        ],
                        confidence=54,
                    )
                )
                order.flags.append(
                    Flag(
                        order_id=order.id,
                        line_id=order.lines[2].id,
                        kind=FlagKind.slang,
                        issue="Two products share this slang",
                        quote="Add 15 kegs of the yellow one.",
                        why="'Yellow one' could be Kings Vegetable Oil (25L, red cap) or Fortune Soya Oil "
                        "(25L, yellow label). Both are in your catalog.",
                        options=[
                            {"label": "Kings Vegetable Oil 25L", "sku": "KVO-25R"},
                            {"label": "Fortune Soya Oil 25L", "sku": "FSL-25"},
                        ],
                        confidence=71,
                    )
                )
            if number == 1037:
                order.evidence.append(
                    Evidence(order_id=order.id, kind=EvidenceKind.text, text="[photo of stacked bags]")
                )
                order.lines[0].confidence_score, order.lines[0].review_state = 62, ReviewState.check
                await db.flush()
                order.flags.append(
                    Flag(
                        order_id=order.id,
                        line_id=order.lines[0].id,
                        kind=FlagKind.photo,
                        issue="Product match 62%",
                        quote="[Blurry photo of stacked bags]",
                        why="The stitching pattern matches Royal Stallion, but the label looks closer to "
                        "Mama Gold. Confirming keeps your stock counts honest.",
                        options=[
                            {"label": "Royal Stallion Parboiled 50kg", "sku": "RSR-50"},
                            {"label": "Mama Gold Premium 50kg", "sku": "MGR-50"},
                        ],
                        confidence=62,
                    )
                )
            order_svc.recompute(order)
            if status in ("pending", "paid"):
                order.status = OrderStatus.pending
                order.confirmed_at = created + timedelta(minutes=5)
                await ledger_svc.post_invoice(db, order, user.id)
            await db.flush()
            if pay == "matched":
                await record_credit(
                    db,
                    business.id,
                    provider="paystack",
                    reference=f"LEDA-{number}",
                    amount=order.subtotal,
                    received_at=created + timedelta(minutes=12),
                    account_number=r.dva_account_number,
                    narration=f"LE-{number}",
                    raw={"seed": True},
                )
            elif pay == "review":
                await record_credit(
                    db,
                    business.id,
                    provider="paystack",
                    reference=f"TRF-{number}",
                    amount=order.subtotal,
                    received_at=created + timedelta(minutes=30),
                    account_number=None,
                    narration="transfer",
                    raw={"seed": True},
                )
        db.add(
            Notification(
                business_id=business.id,
                kind="flag",
                title="3 messages need your eye",
                detail="Sabi flagged uncertainty in voice notes and photos",
            )
        )
        await db.commit()
        print(f"Seeded business '{business.name}'. Sign in as {OWNER_EMAIL} / {OWNER_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
