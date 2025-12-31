import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    // Verify the request is from Vercel Cron (optional but recommended)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Revalidate the main page and OG image
        revalidatePath('/', 'page');
        revalidatePath('/api/og', 'page');

        return NextResponse.json({
            revalidated: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 });
    }
}
