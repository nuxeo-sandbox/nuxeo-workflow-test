## Description
This repository contains a sample node scripts to simulate users completing workflow tasks in webui. It uses the nuxeo js client to make the same API calls that webui makes

## Important Note

**These features are not part of the Nuxeo Production platform.**

These solutions are provided for inspiration and we encourage customers to use them as code samples and learning resources.

This is a moving project (no API maintenance, no deprecation process, etc.) If any of these solutions are found to be useful for the Nuxeo Platform in general, they will be integrated directly into platform, not maintained here.

## How to build
Building requires the following software:
- git
- node
- npm

```
git clone https://github.com/nuxeo-sandbox/nuxeo-workflow-test
cd nuxeo-workflow-test
```

## Configure
The index.js uses two configuration files

### Credentials.json
Describes the credentials to use for each role in the workflow
```
{
  "Manager":{
    "username":"manager",
    "password":"123"
  },
  "Underwriter":{
    "username":"underwriter",
    "password":"456"
  }
}

```


### Config.json
Describes the process to simulate

```
{
  "baseUrl":"http://localhost:8080/nuxeo",
  "document": {
      "creator":"Manager",
      "path": "/default-domain/ApplicationRoot",
      "type":"Application",
      "name":"AP",
      "properties": {}
  },
  "scenario": [
    {
      "role":"Manager",
      "action":"assign",
      "variables":{
        "underwriter": "Bob"
      }
    },
    {
      "role":"Underwriter",
      "action":"proceed",
      "variables":{
        "examination_blob":{
          "type":"blob",
          "file":"files/guarantor-request-example.pdf",
          "mimeType":"application/pdf"
        }
      }
    }
  ]
}
```

- baseurl is the server baseUrl
- document is the document to create and that will be used by the workflow
  - creator: the profile to use to create the document
- scenario is an array that contains the step to simulate. For each step, the following variables can be set
  - role: the role to use
  - action: the button clicked by a real user in webui
  - variable: the node variables to set
    - if a variable is a blob, the variable value must be an object as described in the sample above

## Run
```
node index.js
```

## Known limitations
This plugin is a work in progress.

## About Nuxeo
Nuxeo dramatically improves how content-based applications are built, managed and deployed, making customers more agile, innovative and successful. Nuxeo provides a next generation, enterprise ready platform for building traditional and cutting-edge content oriented applications. Combining a powerful application development environment with SaaS-based tools and a modular architecture, the Nuxeo Platform and Products provide clear business value to some of the most recognizable brands. More information is available at [www.nuxeo.com](http://www.nuxeo.com).
