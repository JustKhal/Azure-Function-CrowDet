const { app } = require('@azure/functions');
require('./functions/SendApprovalNotification'); // Path adjusted if needed
require('./functions/SendFCMNotification');
require('./functions/FetchGroupMembers');
require('./functions/CreateGroupInvitation');
require('./functions/KickMember');
require('./functions/FetchUserEmail');
require('./functions/DeleteGroup');
app.setup({
    enableHttpStream: true,
});
