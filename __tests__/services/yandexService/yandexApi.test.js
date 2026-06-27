const YandexApi = require('../../../services/yandexService/api');

describe('YandexApi', () => {
    describe('normalizeEventUrl', () => {
        test('keeps absolute CalDAV URLs unchanged', () => {
            const url = 'https://caldav.yandex.ru/calendars/user%40example.com/events-123/';

            expect(YandexApi.normalizeEventUrl(url)).toBe(url);
        });

        test('resolves relative event URLs against CalDAV base URL', () => {
            expect(YandexApi.normalizeEventUrl('/calendars/user%40example.com/events-123/event.ics'))
                .toBe('https://caldav.yandex.ru/calendars/user%40example.com/events-123/event.ics');
        });
    });
});
