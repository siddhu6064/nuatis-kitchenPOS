# Nuatis POS — Cafe Prototype

Throwaway UX prototype for a cafe point-of-sale flow. Built in one day
on Replit Agent to validate tablet checkout flows for the Nuatis POS
product.

## ⚠️ This is not production code

- No backend, no real Stripe, no real auth beyond Replit's gate
- State is localStorage only — clears with browser data
- Mock payments auto-approve after 2.5s, no real card processing
- Single hardcoded cafe menu, single hardcoded merchant
- Stack is React + Vite (production build will be Next.js 14)
- Architecture, data model, and tech choices here do NOT carry forward

## What it demonstrates

- Login → menu → cart → checkout → tip → mock pay → approved → receipt
- Tablet-optimized layout (1024×768)
- localStorage cart persistence across refresh
- Printable receipt with thermal-printer @media print stylesheet

## Production build

The real Nuatis POS is a separate codebase, mothballed until the
Nuatis Suite ships (Aug 2026+). See internal Master Plan docs for
scope, architecture, and roadmap.

---
Built by Siddhu · Nuatis LLC
