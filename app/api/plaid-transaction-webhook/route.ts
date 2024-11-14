// app/api/plaid-webhook/route.ts

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    console.log("SUCCESS WOO HOO");
    return NextResponse.json({ message: 'Webhook received' }, { status: 200 });
}
