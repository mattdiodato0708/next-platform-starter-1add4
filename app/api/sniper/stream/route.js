import { subscribeSSE } from '../../../../lib/sniper/bot.js';

export const dynamic = 'force-dynamic';

export function GET() {
    const encoder = new TextEncoder();
    let unsubscribe;
    let keepAlive;

    const stream = new ReadableStream({
        start(controller) {
            const enqueue = (chunk) => controller.enqueue(encoder.encode(chunk));
            unsubscribe = subscribeSSE({ enqueue });

            // Keep-alive comment every 25 s to prevent proxy timeouts
            keepAlive = setInterval(() => {
                try {
                    enqueue(': keep-alive\n\n');
                } catch (_) {
                    clearInterval(keepAlive);
                }
            }, 25000);
        },
        cancel() {
            clearInterval(keepAlive);
            unsubscribe?.();
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        }
    });
}
