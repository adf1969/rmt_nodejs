/*
 * 
 * 
 * Start server:
 * node index.js
 */

var debug = true;
var fs = require('fs');
var _ = require('lodash');
var http = require('http');
var faye = require('faye');  
var async = require('async');
var axios = require('axios');
var pino = require('pino')();
var URI = require('urijs');
//var Promise = require('es6-promise').Promise;

// Initialize podiojs client
var Podio = require('podio-js').api;
var config = JSON.parse(fs.readFileSync('./config.json'));

var taskid = 83000761;
var taskid2 = 83003342;
var spaceid = 5731005;

var tasks = ["83000761", "83003342" ];
var labels = [];


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
  //console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  pino.warn('Unhandled Rejection at: Promise', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

function isFunction(functionToCheck) {
 var getType = {};
 return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
}

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

function authUserSync (connection, userInfo) {
  async.series([
    async function(callback) {
      await new Promise(function(resolve, reject) {        
        connection.authenticateWithCredentials(userInfo.username, userInfo.password);
        resolve();
      });      
      //callback(null);
    },
    async function(callback) {
      let respData = await connection.request('get','/user/status');
      //callback(null, respData);
    }],
    function(err, results) {
      return results[1];
    }); // async.series[]
}

function authUserSync2(connection, userInfo) {
  
}

function getTask(connection, taskId) {
  console.log("Process Task: ", taskId);
  connection.request('get', '/task/' + taskid, {})
    .then(function(responseData){
      console.log("Task responseData", responseData);
      return responseData;
    }).catch(handleError);
}

function addSubscription(connection, taskId) {
  console.log("Process Task: ", taskId);
  var task = getTask(connection, taskId);    
  connection.push(task.push).subscribe(onNotificationReceived)
    .then(function(responseData) {
      console.log('Added subscription to taskid ', taskid);
    }).catch(handleError);
}

function addSubscriptionToTask(connection, taskId, callback) {
  console.log("Process Task: ", taskId);
  connection.request('get', '/task/' + taskId, {})
    .then(function(responseData){
      //console.log("Task responseData", responseData);
      console.log("responseData.push", responseData.push);
      connection.push(responseData.push).subscribe(onNotificationReceived)
        .then(function() {
          console.log('Added subscription to taskid ', taskId);          
          callback();
        }).catch(handleError);
    }).catch(handleError);
}

function getConnection() {
  var connection = new Podio({
    authType: 'client',
    clientId: config.clientId,
    clientSecret: config.clientSecret  
    }, {
      apiURL: config.apiURL,
      enablePushService: true  
  });
  return connection;  
}
function authAndAddSubscriptionToTask(taskId, callback) {
//  var connection = new Podio({
//    authType: 'client',
//    clientId: config.clientId,
//    clientSecret: config.clientSecret  
//    }, {
//      apiURL: config.apiURL,
//      enablePushService: true  
//  });
  var connection = getConnection();
  
  console.log("Auth and Add Subscription to Task: ", taskId);
  userInfo = config.rmticket_user;
  connection.authenticateWithCredentials(userInfo.username, userInfo.password, function() {
    console.log("Get User Status to Auth");
    connection.request('get','/user/status')
      .then(function(responseData) {
        console.log("User data: ", responseData);
        console.log("Get Task: ", taskId);
        connection.request('get', '/task/' + taskId, {})
          .then(function(responseData){
            //console.log("Task responseData", responseData);
            console.log("responseData.push", responseData.push);
            connection.push(responseData.push).subscribe(onNotificationReceived)
              .then(function() {
                console.log('Added subscription to taskid ', taskId);          
                callback();
              }).catch(handleError);
          }).catch(handleError);
      }).catch(handleError);
  });
}

function authAndAddSubscriptionToTaskV2(taskId, callback) {
//  var connection = new Podio({
//    authType: 'client',
//    clientId: config.clientId,
//    clientSecret: config.clientSecret  
//    }, {
//      apiURL: config.apiURL,
//      enablePushService: true  
//  });
  var connection = getConnection();
  
  console.log("Auth and Add Subscription to Task: ", taskId);
  userInfo = config.rmticket_user;
  connection.isAuthenticated().then(function() {
    addSubscriptions(taskId, callback);
  }).catch(function(err) {
    connection.authenticateWithCredentials(userInfo.username, userInfo.password, function() {
      addSubscriptions(taskId, callback);
    });
  });
  
  function addSubscriptions(taskId, callback) {
    connection.request('get', '/task/' + taskId, {})
      .then(function(responseData){
        //console.log("Task responseData", responseData);
        console.log("responseData.push", responseData.push);
        connection.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to taskid ', taskId);          
            callback();
          }).catch(handleError);
      }).catch(handleError);
  };
  
}
function onNotificationReceived (notification) {  
  var eType = notification.data.event;
  var data = notification.data;
  switch (eType) {
    case 'comment_create':
      break;
    
    case 'viewing':
    case 'typing':
      // Skip these...
      break;
      
    case 'stream_create': // task
      break;
      
    case 'stream_event': // space
      //  Called when I added a comment to a task that was in a space I was monitoring      
      //  Data you get:
      //   notification.created_by.type = "user"
      //   notification.created_by.id = user_id (user id of the creating user)
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
      var dataRefType = data.ref.type;
      var dataRefId = data.ref.id;      
      var dataType = data.data.type;
      pino.debug('stream_event. notification.data', notification.data);
      break;
    
    case 'update': // task
      break;
      
    default:
      pino.trace('Other Notification. notification.data', notification.data);
      break;
      
  }
}


/**
 * 
 * @return {undefined}
 * 
 * Gets all the labels of the user/pass passed in userInfo
 */
function getUserLabels(userInfo, callback) {
  if (userInfo == null) {
    userInfo = config.rmticket_user;
  }
  if (userInfo.username in labels) {
    responseData = labels[userInfo.username];
    if (isFunction(callback)) { 
      callback(null, responseData); 
    } else {
      return responseData;
    }
  }
  
  var connection = getConnection();
  authUser(connection, userInfo, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/label/');
      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Labels: ", responseData);        
          labels[userInfo.username] = responseData;
          if (isFunction(callback)) { 
            callback(null, responseData); 
          } else {
            return responseData;
          }
        });
    }); // authUser()
}

function getUserLabelsSync(userInfo) {
  if (userInfo == null) {
    userInfo = config.rmticket_user;
  }
  if (userInfo.username in labels) {
    responseData = labels[userInfo.username];
    return responseData;
  }  
  var connection = getConnection();
  authUser(connection, userInfo, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/label/');
      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Labels: ", responseData);        
          labels[userInfo.username] = responseData;
          return responseData;
        });
    }); // authUser()
}


/**
 * 
 * @param {type} completed
 * @param {type} page
 * @param {type} pageSize
 * @param {type} app_id
 * @return {undefined}
 * 
 * Format for getting a task is:
 * Get all incomplete tasks in a specific App
 * /task/?app=#&completed=0&offset=0&sort_by=rank&sort_desc=false
 * 
 * Get all incomplete tasks with a specific label (you have to KNOW the Label ID first!)
 * /task/?app=19864431&completed=0&grouping=label&label=2481588&limit=10&offset=0&sort_by=rank&sort_desc=false
 */
function getAllTasks(completed, page, pageSize, app_id) {
  if (app_id == null) {
    app_id = config.rmticket_app.id;
  }
  var connection = getConnection();
  authUser(connection, config.rmticket_user, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/')
        .addQuery('app', app_id)
        .addQuery('completed', completed);

      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Tasks: ", responseData);        
          return responseData;
        });
    }); // authUser()
}

//getAllTasks(0, 1, 100);

if (false) {
async.series([
  function(callback) {
    var l1 = getUserLabels(null, callback);
    console.log("Labels 1:", l1);
  },
  function(callback) {
    var l2 = getUserLabels(null, callback);        
    console.log("Labels 2:", l2);
  }
  ],
  function(err, results) {
    console.log("2nd Labels 1:", results[0]);
    console.log("2nd Labels 2:", results[1]);
  });
  
}


// NOTE - because of how getUserLabels works, it will AUTO-RETURN as soon as it runs
// unless you pass (null, callback) - then it will run callback once it returns
// I should probably make this a Promise? Then I can add a .then() to it.
//
if (false) {
var l1 = getUserLabels();
console.log("Labels 1:", l1);
}


async function authUserSync2 (connection, userInfo) {
  let ret = await new Promise(async function(resolve, reject) { 
    await connection.authenticateWithCredentials(userInfo.username, userInfo.password);
    resolve();
  });
  var retVal = connection.isAuthenticated();
  return retVal;
}

if (false) {
  var conn = getConnection();
  var ud = authUserSync2(conn, config.rmticket_user); 
  console.log("UserData: ", ud);
}



//var l1 = getUserLabels();
//var l2 = getUserLabels();


testMultiTasks4();
function testMultiTasks4() {
  console.log("Starting: testMultiTasks4");

  // Process all tasks      
  async.eachSeries(tasks, function(taskId, callback) {
    console.log("Process ", taskId);
    authAndAddSubscriptionToTaskV2(taskId, callback);
    //callback();
  }, function(err) {
    if (err) {
      console.log("Error processing tasks", err);
    } else {
      console.log("All tasks processed successfully.");
    }
  }); // async.eachSeries()
  
}

//testGetUsersLabelsSync();
function testGetUserLabelsSync() {
  var connection = getConnection();
  authUser(connection, config.rmticket_user, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/')
        .addQuery('app', app_id)
        .addQuery('completed', completed);

      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Tasks: ", responseData);        
          return responseData;
        });
    }); // authUser()  
}


// THIS DOES NOT WORK - Node.JS is TRASH
async function getUserLabelsP(userInfo) {
  if (userInfo == null) {
    userInfo = config.rmticket_user;
  }
  var connection = getConnection();  
  console.log("getUserLabelsP: ", userInfo);  
  
  return new Promise(async function(resolve, reject) {
    if (userInfo.username in labels) {
      responseData = labels[userInfo.username];
      resolve(responseData);
    }    
    responseData = await authUserIsAuth(connection, userInfo, () => getUserLabels());
    resolve(responseData);
  });
  
  
  async function getUserLabels() {
    var url = new URI('/task/label/');
    await connection.request('get', url.toString())
      .then(function(responseData) {
        console.log("Labels: ", responseData);        
        labels[userInfo.username] = responseData;
        return responseData;
      });
  };   
}


console.log("rmt_nodejs finished loading.");