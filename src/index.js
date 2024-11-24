const { app } = require('@azure/functions');
require('./functions/SendApprovalNotification'); // Path adjusted if needed
require('./functions/SendFCMNotification');
require('./functions/FetchGroupMembers');
require('./functions/CreateGroupInvitation');
require('./functions/KickMember');
require('./functions/FetchUserEmail');
require('./functions/DeleteGroup');
require('./functions/RegisterUser');
require('./functions/LoginUser');
app.setup({
    enableHttpStream: true,
});
