import Link from 'next/link';
import { Card } from 'components/card';
import { ContextAlert } from 'components/context-alert';
import { Markdown } from 'components/markdown';
import { RandomQuote } from 'components/random-quote';
import { getNetlifyContext } from 'utils';

const contextExplainer = `
The card below is rendered on the server based on the value of \`process.env.CONTEXT\` 
([docs](https://docs.netlify.com/configure-builds/environment-variables/#build-metadata)):
`;

const preDynamicContentExplainer = `
The card content below is fetched by the client-side from \`/quotes/random\` (see file \`app/quotes/random/route.js\`) with a different quote shown on each page load:
`;

const ctx = getNetlifyContext();

export default function Page() {
    return (
        <div className="flex flex-col gap-12 sm:gap-16">
            <section>
                <ContextAlert className="mb-6" />
                <h1 className="mb-4">Netlify Platform Starter – Next.js</h1>
                <p className="mb-6 text-lg">
                    Deploy the latest version of Next.js — including Turbopack, React Compiler, and the new caching APIs
                    — on Netlify in seconds. No configuration or custom adapter required.
                </p>
                <Link href="https://docs.netlify.com/frameworks/next-js/overview/" className="btn btn-lg sm:min-w-64">
                    Read the Docs
                </Link>
            </section>
            {!!ctx && (
                <section className="flex flex-col gap-4">
                    <Markdown content={contextExplainer} />
                    <RuntimeContextCard />
                </section>
            )}
            <section className="flex flex-col gap-4">
                <Markdown content={preDynamicContentExplainer} />
                <RandomQuote />
            </section>
            <section className="flex flex-col gap-4">
                <SportsArbLink />
            </section>
        </div>
    );
}

function SportsArbLink() {
    const siteUrl =
        process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
    const sportsPath = '/sports';
    const fullUrl = siteUrl ? `${siteUrl}${sportsPath}` : sportsPath;

    return (
        <Card title="🏆 Sports Arbitrage Scanner">
            <p>
                Scan sportsbook odds across DraftKings, FanDuel, BetMGM, and more to find guaranteed-profit
                arbitrage opportunities.
            </p>
            <Link href="/sports" className="btn btn-lg sm:min-w-64 text-center mt-2 inline-block">
                Open Sports Arb Scanner
            </Link>
            {!!siteUrl && (
                <div className="mt-4 text-sm text-neutral-500">
                    <p className="font-semibold mb-1">Use in Expo / React Native:</p>
                    <code
                        aria-label="Sports page URL for mobile integration"
                        className="block bg-neutral-100 px-3 py-2 rounded text-xs break-all select-all"
                    >
                        {fullUrl}
                    </code>
                    <p className="mt-1">
                        Open this URL with <code>Linking.openURL()</code>, <code>WebBrowser.openBrowserAsync()</code>,
                        or load it in a <code>&lt;WebView&gt;</code> component.
                    </p>
                </div>
            )}
        </Card>
    );
}

function RuntimeContextCard() {
    const title = `Netlify Context: running in ${ctx} mode.`;
    if (ctx === 'dev') {
        return (
            <Card title={title}>
                <p>Next.js will rebuild any page you navigate to, including static pages.</p>
            </Card>
        );
    } else {
        const now = new Date().toISOString();
        return (
            <Card title={title}>
                <p>This page was statically-generated at build time ({now}).</p>
            </Card>
        );
    }
}
