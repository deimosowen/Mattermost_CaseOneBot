const moment = require('moment-timezone');
const { createDAVClient, DAVNamespace } = require('tsdav');
const ical = require('ical');
const axios = require('axios');
const logger = require('../../logger');

class YandexApi {
    constructor(username, password) {
        if (!username || !password) {
            throw new Error('Необходимо указать имя пользователя и пароль');
        }
        this.username = username;
        this.password = password;
    }

    /**
     * Инициализация клиента DAV
     */
    async init() {
        try {
            this.client = await createDAVClient({
                serverUrl: 'https://caldav.yandex.ru',
                credentials: {
                    username: this.username,
                    password: this.password,
                },
                authMethod: 'Basic',
                defaultAccountType: 'caldav',
                defaultRequestOptions: {
                    timeout: 60000,
                },
            });
        } catch (error) {
            logger.error(error);
            throw new Error('Не удалось инициализировать DAV клиент.');
        }
    }

    /**
     * Загрузка события напрямую по URL
     * @param {String} eventUrl - URL события
     * @returns {Object} Данные события
     */
    async fetchEventDirectly(eventUrl) {
        try {
            const response = await axios.get(`https://caldav.yandex.ru${eventUrl}`, {
                auth: {
                    username: this.username,
                    password: this.password,
                },
                timeout: 10000,
            });
            const icsData = response.data;
            const parsed = ical.parseICS(icsData);
            const eventKey = Object.keys(parsed).find((key) => parsed[key].type === 'VEVENT');
            if (eventKey) {
                const details = parsed[eventKey];
                const eventStart = moment(details.start).format('YYYY-MM-DDTHH:mm:ss');
                const eventStartDateInOriginalTz = moment.tz(eventStart, 'YYYY-MM-DDTHH:mm:ss', details.start.tz).utc();

                const eventEnd = moment(details.end).format('YYYY-MM-DDTHH:mm:ss');
                const eventEndDateInOriginalTz = moment.tz(eventEnd, 'YYYY-MM-DDTHH:mm:ss', details.start.tz);

                return {
                    id: `${details.uid}_${details.sequence}_${eventStartDateInOriginalTz.format('YYYY-MM-DDTHH:mm:ss')}`,
                    url: details.url,
                    summary: details.summary || 'Без названия',
                    description: details.description || '',
                    start: eventStartDateInOriginalTz,
                    end: eventEndDateInOriginalTz
                };
            } else {
                throw new Error('Событие не содержит данных.');
            }
        } catch (error) {
            logger.error(`Ошибка загрузки события по URL ${eventUrl}:`, error);
            throw new Error(`Не удалось загрузить событие по URL ${eventUrl}.`);
        }
    }

    /**
     * Получение событий за указанный период
     * @param {String} start - Начало периода (ISO 8601)
     * @param {String} end - Конец периода (ISO 8601)
     * @returns {Array} Список событий
     */
    async listEvents(start, end) {
        try {
            const calendars = await this.client.fetchCalendars();
            if (!calendars || calendars.length === 0) {
                throw new Error('Календари не найдены.');
            }

            const events = await this.client.calendarQuery({
                url: calendars[0].url,
                props: [
                    { name: 'getetag', namespace: DAVNamespace.DAV },
                    { name: 'calendar-data', namespace: DAVNamespace.CALDAV },
                ],
                filters: [
                    {
                        'comp-filter': {
                            _attributes: { name: 'VCALENDAR' },
                            'comp-filter': {
                                _attributes: { name: 'VEVENT' },
                                'time-range': {
                                    _attributes: {
                                        start: start,
                                        end: end,
                                    },
                                },
                            },
                        },
                    },
                ],
                depth: '1',
            });

            const parsedEvents = [];
            for (const event of events) {
                try {
                    const eventData = await this.fetchEventDirectly(event.href);
                    parsedEvents.push(eventData);
                } catch (error) {
                    logger.warn(`Не удалось загрузить событие ${event.href}:`, error);
                }
            }

            return parsedEvents;
        } catch (error) {
            logger.error(error);
            throw new Error('Не удалось получить события.');
        }
    }

    /**
     * Создание нового события
     * @param {Object} eventData - Данные события
     * @returns {String} URL созданного события
     */
    async createEvent(eventData) {
        try {
            const { summary, start, end, location, organizer, attendees = [] } = eventData;

            const attendeeStrings = attendees
                .map(attendee =>
                    `ATTENDEE;PARTSTAT=${attendee.partstat || 'NEEDS-ACTION'};CN=${attendee.name};ROLE=${attendee.role || 'REQ-PARTICIPANT'}:mailto:${attendee.email}`
                )
                .join('\n');

            const organizerString = organizer
                ? `ORGANIZER;CN=${organizer.name}:mailto:${organizer.email}`
                : '';

            const conference = await this.createTelemostConference();
            const conferenceUrl = conference.join_url;
            const conferenceFields = [
                `CONFERENCE:${conferenceUrl}`,
                `X-TELEMOST-CONFERENCE:${conferenceUrl}`
            ].join('\n');

            const description = `Ссылка на видеовстречу: ${conferenceUrl}`;
            const iCalString = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//caseonebot//EN',
                'CALSCALE:GREGORIAN',
                'METHOD:PUBLISH',
                'BEGIN:VEVENT',
                `SUMMARY:${summary || 'Без названия'}`,
                `UID:event-${Date.now()}@caseonebot`,
                'SEQUENCE:0',
                'STATUS:CONFIRMED',
                'TRANSP:OPAQUE',
                `DTSTART:${moment.utc(start).format('YYYYMMDDTHHmmss')}Z`,
                `DTEND:${moment.utc(end).format('YYYYMMDDTHHmmss')}Z`,
                `DTSTAMP:${moment.utc().format('YYYYMMDDTHHmmss')}Z`,
                `LOCATION:${location || ''}`,
                `DESCRIPTION:${description || ''}`,
                organizerString,
                attendeeStrings,
                conferenceFields,
                'CLASS:PUBLIC',
                'END:VEVENT',
                'END:VCALENDAR'
            ].join('\n');

            const calendars = await this.client.fetchCalendars();
            if (!calendars || calendars.length === 0) {
                throw new Error('Календари не найдены.');
            }

            const eventUrl = await this.client.createCalendarObject({
                calendar: calendars[0],
                filename: `event-${Date.now()}.ics`,
                iCalString: iCalString.trim(),
            });

            return {
                event: eventUrl,
                conference: conference
            };
        } catch (error) {
            logger.error('Ошибка создания события:', error);
            throw new Error('Не удалось создать событие.');
        }
    }

    /**
     * Cоздания видеовстречи
     */
    async createTelemostConference() {
        try {
            const response = await axios.post(
                'https://cloud-api.yandex.net/v1/telemost-api/conferences',
                {
                    access_level: 'ORGANIZATION'
                },
                {
                    headers: {
                        Authorization: `OAuth ${this.password}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.status === 201) {
                return response.data;
            } else {
                throw new Error(`Unexpected response status: ${response.status}`);
            }
        } catch (error) {
            logger.error('Ошибка при создании видеовстречи:', error);
            throw new Error('Не удалось создать видеовстречу.');
        }
    }
}

module.exports = YandexApi;