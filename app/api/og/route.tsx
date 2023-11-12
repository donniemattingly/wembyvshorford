import {ImageResponse} from 'next/og';
import {fetchData, horfordUrl, wembyUrl} from "@/app/bbref-api";
import TimingBreakdown from "@/components/TimingBreakdown";
import React from "react";
// App router includes @vercel/og.
// No need to install it.

// export const runtime = 'edge';

export async function GET() {
    const data = await fetchData();
    if (data !== null) {
        const {wemby, horford} = data;
        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'black',
                    }}
                >
                    <div tw="flex flex-col items-center justify-center">
                        <div tw="flex flex-col w-full py-12 px-4 justify-between text-white">
                            <div tw='text-5xl'>
                                Does Victor Wembanyama have more career win shares than Al Horford?
                            </div>
                            {horford.winShares > wemby.winShares
                                ? <h1 tw='text-9xl font-extrabold'> No </h1>
                                : <h1 tw='text-9xl font-extrabold'> Yes </h1>
                            }
                            <div tw="flex flex-col w-1/2 text-4xl font-normal text-cyan-400">
                                <p>Horford: {horford.winShares}</p>
                                <p>Wembanyama: {wemby.winShares}</p>
                            </div>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            },
        );
    }
}