// Централизованные моки для dutyService
jest.mock('../../../db/models/duty');
jest.mock('../../../mattermost/utils');
jest.mock('../../../services/absenceService');
jest.mock('../../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));
jest.mock('../../../resources', () => ({
    duty: {
        noCurrent: 'Нет текущего дежурного',
        currentNotification: 'Текущий дежурный: {user}',
        noUsersError: 'Нет доступных пользователей',
        noExistingError: 'Нет существующего дежурного',
        nextNotification: 'Следующий дежурный: {user}',
        changeStatusSuccess: 'Статус пользователя {user} изменен',
        notFoundError: 'Пользователь не найден',
    },
}));
jest.mock('isdayoff', () => {
    return jest.fn(() => ({
        date: jest.fn(),
        today: jest.fn(),
    }));
});

// Импорт после jest.mock(...)
const {
    getCurrentDuty: getDutyFromDB,
    getDutyUsers,
    getDutySchedule,
    setCurrentDuty,
    updateUserActivityStatus,
    getAllUnscheduledUsers,
    deleteUnscheduledUser,
} = require('../../../db/models/duty');

const { postMessage, getUserByUsernameOrEmail } = require('../../../mattermost/utils');
const absenceService = require('../../../services/absenceService');
const logger = require('../../../logger');
const resources = require('../../../resources');
const DutyType = require('../../../types/dutyTypes');

const moment = require('moment');

beforeEach(() => {
    jest.clearAllMocks();

    // Дефолтные моки
    getDutyFromDB.mockResolvedValue(null);
    getDutyUsers.mockResolvedValue([]);
    getDutySchedule.mockResolvedValue({
        nextDutyMessage: 'Следующий дежурный: {user}',
    });
    setCurrentDuty.mockResolvedValue(undefined);
    updateUserActivityStatus.mockResolvedValue(undefined);
    getAllUnscheduledUsers.mockResolvedValue([]);
    deleteUnscheduledUser.mockResolvedValue(undefined);
    getUserByUsernameOrEmail.mockResolvedValue({
        id: 'user-1',
        username: 'john.doe',
        email: 'john@example.com',
    });
    absenceService.checkEmployeeAvailabilityByDate.mockResolvedValue({});
    postMessage.mockResolvedValue({ id: 'post-123' });
});

module.exports = {
    // db models
    getDutyFromDB,
    getDutyUsers,
    getDutySchedule,
    setCurrentDuty,
    updateUserActivityStatus,
    getAllUnscheduledUsers,
    deleteUnscheduledUser,

    // utils
    postMessage,
    getUserByUsernameOrEmail,

    // services
    absenceService,

    // constants
    DutyType,

    // logger
    logger,

    // resources
    resources,

    // utils
    moment,
};

