const INTEGRATION_TEST_DELAY = 1;

export function delay(appDelay: number) {
    return process.env.INTEGRATION_TEST ? INTEGRATION_TEST_DELAY : appDelay;
}