let chatMap = new Map();

function getChatIdForPost(postId) {
    return chatMap.get(postId);
}

function setChatIdForPost(postId, chatId) {
    chatMap.set(postId, chatId);
}

module.exports = {
    getChatIdForPost,
    setChatIdForPost
};
