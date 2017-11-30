/*
 * 
 * 
 * Start server:
 * node index.js
 */

var fs = require('fs');
var _ = require('lodash');
var http = require('http');
var faye = require('faye');  
var async = require('async');
var axios = require('axios');

// Initialize podiojs client
var Podio = require('podio-js').api;
var config = JSON.parse(fs.readFileSync('./config.json'));

var taskid = 83000761;
var taskid2 = 83003342;
var spaceid = 5731005;

var podio = new Podio({
  authType: 'client',
  clientId: config.clientId,
  clientSecret: config.clientSecret  
  }, {
    apiURL: config.apiURL,
    enablePushService: true  
});

var podioS = new Podio({
  authType: 'client',
  clientId: config.clientId,
  clientSecret: config.clientSecret  
  }, {
    apiURL: config.apiURL,
    enablePushService: true  
});

// Login details
var podioUser = {
  username: 'avcorp.rmticket@gmail.com',
  password: '625-avcrmt',
  user_id: '',
};


// - doesn't work. Podio's docs suck
// Error handling for podiojs
//podio.on('error', function(apiRequest, response, body){
//  console.error('Podio Error:', body);
//});

// Initialize faye client
var fayeClient = new faye.Client('https://push.podio.com/faye');

// Extend faye client with signature and timestamp used for authentication
fayeClient.addExtension({
  'outgoing': function(message, callback) {
    message.ext = message.ext || {};
    message.ext = {private_pub_signature: push.channel.signature, private_pub_timestamp: push.channel.timestamp};
    callback(message);
  }
});

function handleError (err) {
  console.log("error", err);
}

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});


function authUser (connection, userInfo, callback) {
  connection.authenticateWithCredentials(userInfo.username, userInfo.password, function() {
    connection.request('get','/user/status')
    .then(function(responseData) {
      callback(null, responseData);
    }).catch(function(err) {
      callback(err);
    });
  })
}

function onNotificationReceived (notification) {  
  var eType = notification.data.event;
  var data = notification.data;
  switch (eType) {
    case 'comment_create':
      console.log('Comment_Create Notification received!', notification.data);    
      break;
    
    case 'viewing':
    case 'typing':
      // Skip these...
      break;
      
    case 'stream_create': // task
      // called when a Task is created (among other things)
      // Data you get:
      //  created_by.type = "user"
      //  created_by.id = user_id (user id of the creating user)
      //  data.app_id = app_id (the app id where the task was created)
      //  data.data_ref.id = task_id
      //  data.data_ref.type = "task"
      //  data.context_ref.type = "item" (if it is attached to an item)
      //  data.context_ref.id = item_id (if attached to an item)
      //  space_id: the space id where task was created
      //  data.ref.type = "space"
      //  data.ref.id = space_id
      var dataJson = JSON.stringify(data);
      console.log('stream_create received!', notification.data);    
      break;
      
    case 'stream_event': // space
      //  Called when I added a comment to a task that was in a space I was monitoring      
      //  Data you get:
      //   data.created_by.type = "user"
      //   data.created_by.id = user_id (user id of the creating user)
      //   data.data_ref.type = "comment"
      //   data.data_ref.id = comment_id      
      //   data.ref.type = "task"
      //   data.ref.id = task_id
      //   data.data.type = "comment"
      //  Called when I update a task      
      //  Data you get
      //   data.ref.type = "task"
      //   data.ref.id = task_id  
      //   data.event_id = event_id      
      //   data.type = "update"
      //   data.data_ref.type = "task_action"   
      //   data.data_ref.id = task_id      
      //   notification.created_by.type = "user"
      //   notification.created_by.id = user_id (user id of the creating user)
      //   notification.created_via: 1 (not sure what this means)      
      //    
      var dataJson = JSON.stringify(data);
      var dataType = data.data.type;
      var dataRefType = data.ref.type;
      var dataRefId = data.ref.id;
      console.log('stream_event received!', notification.data);    
      break;
    
    case 'update': // task
      // Called when a user updates a task
      // Data you get:
      //  created_by.type = "user"
      //  created_by.id = user_id (user id of the creating user)
      //  data.data_ref.id = comment_id
      //  data.data_ref.type = "comment"
      //  data.ref.type = "task"
      //  data.ref.id = task_id
      //  data.type = "comment"
      
    default:
      console.log('Other Notification received!', notification.data);    
  }
}

// Simple push object for handling a subscription
var push = {
  subscription: null,
  channel: null,
  messageReceived: function(message) {
    console.log("New message received: ", message);

    // You probably want to filter out your own messages:
    if (message.data.created_by.type == 'user' && message.data.created_by.id != podioUser.user_id){

      console.log("message", message);
      
      // ... do something.

    }
  },
  addSubscription: function(channel) {
    this.channel = channel;
    this.subscription = fayeClient.subscribe(this.channel.channel, this.messageReceived);

    this.subscription.then(function(){
      console.log('Subscription is now active');
    }, function(error){
      console.error('Subscription failed: ', error.message, error);
    });

  }
};

async.parallel([
  _.partial(authUser, podio, config.rmticket_user)  
], function(err, results) {
  
  if (err) { handleError(err); }
  var user1Data = results[0];    
  console.log("rmticket_user data", user1Data);
  
  // Get Task 1
  if (false) {
    podio.request('get', '/task/' + taskid, {})
      .then(function(responseData){
        console.log("Task responseData", responseData);
        podio.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to taskid ', taskid);
          }).catch(handleError);
      }).catch(handleError);
  }
    
  // Get Task 2
  if (false) {
    podio.request('get', '/task/' + taskid2, {})
      .then(function(responseData){
        console.log("Task responseData2", responseData);
        podio.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to taskid2 ', taskid2);
          }).catch(handleError);
      }).catch(handleError);
  }
    
  // Get Space
  if (true) {
    podioS.request('get', '/space/' + spaceid, {})
      .then(function(responseData){
        console.log("Space responseData", responseData);
        podioS.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to spaceid', spaceid);
          }).catch(handleError);
      }).catch(handleError);
  }
});

// SPACE
async.parallel([
  _.partial(authUser, podioS, config.rmticket_user)  
], function(err, results) {
  
  if (err) { handleError(err); }
  var user1Data = results[0];    
  console.log("rmticket_user data", user1Data);
  
  // Get Task 1
  if (false) {
    podio.request('get', '/task/' + taskid, {})
      .then(function(responseData){
        console.log("Task responseData", responseData);
        podio.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to taskid ', taskid);
          }).catch(handleError);
      }).catch(handleError);
  }
    
  // Get Task 2
  if (false) {
    podio.request('get', '/task/' + taskid2, {})
      .then(function(responseData){
        console.log("Task responseData2", responseData);
        podio.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to taskid2 ', taskid2);
          }).catch(handleError);
      }).catch(handleError);
  }
    
  // Get Space
  if (false) {
    podioS.request('get', '/space/' + spaceid, {})
      .then(function(responseData){
        console.log("Space responseData", responseData);
        podioS.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to spaceid', spaceid);
          }).catch(handleError);
      }).catch(handleError);
  }
});


console.log("rmt_nodejs finished loading.");