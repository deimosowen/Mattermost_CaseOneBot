const moment = require('moment');

const getCurrentDate = async () => {
    return {
        data: `Текущая дата: ${moment().format('YYYY-MM-DD')}`,
    };
}

module.exports = {
    name: 'getCurrentDate',
    description: 'Возвращает текущую дату',
    returns: {
        type: "string",
        description: "Возвращает текущую дату"
    },
    function: getCurrentDate,
};