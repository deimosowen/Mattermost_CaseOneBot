const normalizeTestIdentity = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9а-яё_.-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getShortTestName = (value) => {
    const normalized = String(value || '').trim();
    const parts = normalized.split('.');
    return parts[parts.length - 1] || normalized;
};

module.exports = {
    normalizeTestIdentity,
    getShortTestName,
};
