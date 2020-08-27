#!/usr/bin/env node

const Nuxeo = require('nuxeo');
const fs = require('fs');
const path = require('path');
const commandLineArgs = require('command-line-args');

const log = console;

const optionDefinitions = [{
    name: 'credentials',
    type: String,
    defaultValue: "credentials.json"
  },
  {
    name: 'config',
    type: String,
    defaultValue: "config.json"
  },
  {
    name: 'serverUrl',
    type: String
  }
];

const options = commandLineArgs(optionDefinitions);
log.dir(options);

const config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
const credentials = JSON.parse(fs.readFileSync(options.credentials, 'utf8'));

if (!options.serverUrl) {
  options.serverUrl = config.baseUrl;
}
log.info("Server URL: " + options.serverUrl);

//init nuxeo clients for each persona
const nxClients = {};

for (var role in credentials) {
  log.info("Adding role: " + role + " with user " + credentials[role].username);
  nxClients[role] = new Nuxeo({
    baseURL: options.serverUrl,
    auth: {
      method: 'basic',
      username: credentials[role].username,
      password: credentials[role].password
    }
  });
}

log.dir(config, {
  depth: null
});

//create the document for the workflow
let documentDesc = {
  'entity-type': 'document',
  'name': config.document.name,
  'type': config.document.type,
  'properties': config.document.properties
};

createDocument(nxClients[config.document.creator], documentDesc)
  .then(function (doc) {
    documentDesc = doc;
    if (config.workflow) {
      log.info("Starting workflow: " + config.workflow.name);
      return startWorkflow(nxClients[config.workflow.initiator], documentDesc.path, config.workflow);
    } else {
      return Promise.resolve();
    }
  }).then(function (workflow) {
    log.info("Started workflow instance");
    log.dir(workflow, {
      depth: null
    });
    return performStep(documentDesc.path, config.scenario, 0, nxClients);
  }).then(function (data) {
    log.info("Scenario Completed");
    return nxClients[config.document.creator].repository().fetch(documentDesc.path, {
      "schemas": "*"
    });
  }).then(function (doc) {
    log.info("Document after the workflow");
    log.dir(doc, {
      depth: null
    });
    return doc;
  })
  .then(function (doc) {
    log.debug("Checking open workflows...");
    return doc.fetchWorkflows();
  })
  .then(function (workflows) {
    if (workflows.entries.length > 0) {
      log.warn("WARNING: workflows are still active on the document");
      log.dir(workflows, {
        depth: null
      });
    } else {
      log.info("All workflows completed");
      return nxClients[config.document.creator].repository().delete(documentDesc.path);
    }
  }).catch(function (error) {
    log.info("Error encountered when creating document: " + JSON.stringify(error));
    throw error;
  });

function createDocument(client, document) {
  return substituteProperties(document.properties, {
    client: client,
    substitutionFunction: setActualUsersAndUploadFiles,
    credentials: credentials
  }).then(function (batchInfo) {
    return substituteProperties(document.properties, {
      client: client,
      substitutionFunction: replaceFileDescByUploadBatchInfo,
      batchInfo: batchInfo,
      credentials: credentials
    });
  }).then(function (data) {
    log.info("Creating Document: [" + config.document.path + "] ");
    log.dir(document, {
      depth: null
    });
    return client.repository().create(config.document.path, document, {
      "schemas": "*"
    });
  });
}


//Perform one workflow step
function performStep(documentPath, steps, stepIndex, nxClients) {
  const step = steps[stepIndex];
  // const client = nxClients[step.role];
  const role = step.role;
  log.debug(credentials[role].username + ": " + credentials[role].password);
  const client = new Nuxeo({
    baseURL: options.serverUrl,
    auth: {
      method: 'basic',
      username: credentials[role].username,
      password: credentials[role].password
    }
  });
  const actualDocumentPath = step.documentPathModifier ? documentPath + step.documentPathModifier : documentPath;
  log.info("Role for step: " + step.role + " fetching: " + actualDocumentPath);

  let task;
  return client.repository().fetch(actualDocumentPath)
    .then(function (doc) {
      log.debug("Current step: " + prettyPrintObject(step));
      return doc.fetchWorkflows();
    })
    .then(function (workflows) {
      log.debug("Current workflows: " + prettyPrintObject(workflows));
      if (step.workflow) {
        var ent = workflows.entries.find(e => e.workflowModelName === step.workflow);
        if (ent) {
          log.info("Using workflow: " + prettyPrintObject(ent));
          return ent.fetchTasks();
        }
      }
      return workflows.entries[0].fetchTasks();
    })
    .then(function (tasks) {
      log.debug("Current tasks: " + prettyPrintObject(tasks));
      task = tasks.entries[0];
      return substituteProperties(step.variables, {
        client: client,
        substitutionFunction: setActualUsersAndUploadFiles,
        credentials: credentials
      });
    })
    .then(function (batchInfo) {
      return substituteProperties(step.variables, {
        client: client,
        substitutionFunction: replaceFileDescByUploadBatchInfo,
        batchInfo: batchInfo,
        credentials: credentials
      });
    })
    .then(function (data) {
      for (var variable in step.variables) {
        task.variable(variable, step.variables[variable]);
      }
      log.info("Completing Task");
      log.dir({
        "name": task.name,
        "user": client._auth.username,
        "action": step.action,
        "variables": step.variables
      });
      return task.complete(step.action);
    }).then(function (task) {
      if (stepIndex + 1 < steps.length) {
        return performStep(documentPath, steps, stepIndex + 1, nxClients);
      } else {
        Promise.resolve();
      }
    })
    .catch(function (error) {
      throw error;
    });
}


function substituteProperties(properties, ctx) {
  ctx.promises = [];
  substituteObjectProperty(properties, ctx);
  return Promise.all(ctx.promises);
}

function substituteObjectProperty(object, ctx) {
  for (var property in object) {
    var value = object[property];
    let substitute = substituteProperty(value, ctx);
    if (substitute) {
      object[property] = substitute;
    }
  }
}

function substituteArrayProperty(array, ctx) {
  array.forEach((item, index) => {
    let substitute = substituteProperty(item, ctx);
    if (substitute) {
      array[index] = substitute;
    }
  });
}

function substituteProperty(property, ctx) {
  if (Array.isArray(property)) {
    substituteArrayProperty(property, ctx);
  }
  if (typeof property === 'object' && property !== null) {
    if (property.type) {
      return ctx.substitutionFunction(property, ctx);
    } else {
      return substituteObjectProperty(property, ctx);
    }
  }
}

function setActualUsersAndUploadFiles(value, ctx) {
  if (value.type === "blob") {
    ctx.promises.push(uploadFile(ctx.client, value));
  } else if (value.type === "user") {
    let role = value.role;
    return username = ctx.credentials[role].username;
  }
}

function replaceFileDescByUploadBatchInfo(value, ctx) {
  if (value.type === "blob") {
    var batchInfo = ctx.batchInfo[0];
    ctx.batchInfo.shift();
    return {
      'upload-batch': batchInfo.blob['upload-batch'],
      'upload-fileId': batchInfo.blob['upload-fileId']
    };
  }
}

function uploadFile(client, value) {
  const stream = fs.createReadStream(value.file);
  var blob = new Nuxeo.Blob({
    content: stream,
    name: path.basename(value.file),
    mimeType: value.mimeType,
    size: fs.statSync(value.file).size
  });
  return client.batchUpload().upload(blob);
}

function startWorkflow(client, documentPath, workflow) {
  return client.repository().fetch(documentPath)
    .then(function (doc) {
      return doc.startWorkflow(workflow.name, workflow.variables);
    });
}

function prettyPrintObject(object) {
  return JSON.stringify(object, null, 2);
}