

# GoldmineJS - Server

[![NPM](https://nodei.co/npm/goldmine-server.png?downloads=true&downloadRank=true)](https://nodei.co/npm/goldmine-server/)
Any questions concerning GoldmineJS can be adressed to [me](mailto:michiel@kayzr.com) directly or by opening an issue

## Introduction

GoldmineJS is a framework for building reactive web apps in Javascript.

## Starting from scratch

We're going to build a GoldmineJS server, the server mainly relies on socket.io and orientJS.
Other databases might be added in the future if requested/necessary.

### Prerequisites

* [Node.js](https://nodejs.org/en/)
* npm package manager installed
* [Git](https://git-scm.com/) installed
* A running OrientDB server

### Installation

```
$ npm install goldmine-server
```
```
$ yarn add goldmine-server
```

## Configuration

### Database Configuration

Before running our server there are some things left to do. Since we have to initialize our connection to orientdb, put in our credentials and logging options.

```javascript
const config = {
  debug: true, // enables or disables any analytics/logging at all
  port: 3404, // port to run the goldmine server on

  // Database
  server: {
    servers: [
      {
        "host": "127.0.0.1",
        "port": 2424
      },
      // more servers from the cluster can be added here, a single server will also work
    ],
    host: "127.0.0.1", // ip address of the host running one of the servers
    username: 'goldmine', // name of the user GoldmineJS can use
    password: 'securegoldmineuserpassword', // chosen password for the user selected above
    pool: {
      max: 20, // amount of pooled connections to use, recommended to use at least 5, maximum of 50
    },
  },
  databaseName: 'goldminetestdb',  // name of the database you will be connection to on the servers mentioned above
  auth: {
    force: false, // choses if any authentication is forced or not
    time: 5000, // time until authentication should be completed, otherwise a forced disconnect happens
    validator: confirmApiToken, // functions which validates the users identity on your site/platform
  },

  logging: {
    connections: false, // logs all created/destroyed connections
    authentication: false, // logs every user whom authenticates
    subscriptions: false, // logs the object of each subscription
    publications: false, // logs all new publications that are called by clients
    updates: false, // logs all database udpates received by the server
    statistics: true, // choses if the statistics should be logged at all
    repeat: 5 * 1000, // choses the interval for statistics, uses milliseconds
    custom: customLogsFunction, // custom logging function you can provide yourself to platforms of your choice. This option will only work if logging.statistics is true
  },
};
```

### Publications Config

Next we make a publications object on which clients can subscribe and receive their data for.
The keys of this object are the names of the publications.


When you create a new publication you have to give it a name like in this example *getMyUser*. The publication will always be an array with objects, a function returning an array with objects. This makes it possible to have multiple main queries in a single publication. For our example we only need one main query. 

```javascript
const publications = {
  getMyUser: (myUserId) => {
   return ([
      {
        collection: 'user',
      	fields: ['_id'],
	params: {
	  _id: myUserId
        },
    ]);
  }
};
```

This subscription would execute the query `SELECT _id from user where _id = ${myUserId}`;


### Start the server

The only thing left to do is running the server and connect your GoldmineJS client application.

```
$ npm start
```

### Conclusion

As you can see it is very easy to setup a GoldmineJS server. The example we've build is a very basic one. It is possible to build much more complex publications than the one we covered. You can find examples of different publications throughout this file.

## Publications

Publications are the most important part of the server. Without publications clients can't subscribe on the server and receive data. In this chapter we're going to discuss what's possible and what's not.

Below you can find the complete structure of a publication. Each property will be discussed in it's own section.

**PROPERTIES**

All properties with an ***** are mandatory.

* collection* **(string)**
* fields* **(array)**
* params **(array)**
* extend **(array)**
  * collection* **(string)**
  * target* **(string)**
  * relation* **(string)**
  * fields **(array)**
  * params **(array)**
  * edgeFields **(array)**
* orderBy **(array)**
* skip **(string)**
* limit **(integer | string)**

### collection - mandatory
**Value:** 
string

**Description**:
The property *collection* defines in which collection the data has to be fetched. For instance, I want to fetch a user then I would search for a user in the `user` collection.

### fields - mandatory on top level, otherwise optional
**Value:** 
array / null

**Description**:
The *fields* property provides the ability to select which fields should be returned. When this property isn't defined only the _id's will be returned.
For example: `['username', 'description', 'lastSeen']`
It is mandatory on the top level query since otherwise all data of that obejct would be received by the server, which can be a lot more then you need.
On extends it is optional and will result in the '_id' property to be defaulted to. If the value of fields is null the extend will not be fetched any data from.

### params - optional
**Value:** 
array/object

**Description**:
This is an object/array of optional values to filter your result by.
You can find a list of all the filters after the examples.
For example
```javascript
// Search for multiple friends by Id
{
  _id: {
    operator: 'IN',
    value: ['friendId1', 'friendId2']
  },
},

// Search for an exact Id match
{
  _id: 'friendId1'
}
```

### extend  - optional
**Value:** 
array

**Description**:
An extend makes it possible to fetch data that is connect with each other. You can make a comparison with JOINs in SQL. Just like multiple main queries you can have multiple extends.

Example for a full extend:

```javascript
extend: [
  {
    collection: 'user',
    target: 'friends',
    relation: 'user_login',
    params: {
      _id: myUserId
    }
  }
]
```

#### target - mandatory
**Value:** 
string

**Description**:
The *target* property defines where the dataset of the extend must store its data inside the top level object.


#### relation - mandatory
**Value:** 
string

**Description**:
Defines the edge over which the vertex above and the extend are connected

#### direction - optional
**Value:** 
string('out'/'in')

**Description**:
GoldmineJS will use both as default and the performance difference between out/in/both is negligable, the only need for this is when a collection has an edge referring back to itself.

#### multi - optional(recommended)
**Value:** 
boolean

**Description**:
When you expect one result back from the extend you can set *multi* to *false*. Default results from the extend are stored in an object assigned to the *target* property. When *multi* is *true* the *target* property will contain an array and not an object.
Setting this value will assure you that a single object is an array if there currently is only one, and more will be added later.
If an array is being used with multi:false then all values will be projected on a single object.

### orderBy - optional
**Value:** 
array

**Description**:
You can order the results using the *orderBy* property. You can't order on data returned in extends! When using the short version syntax the direction defaults to ascending.

```javascript
// Long version
[
  {field: 'field', direction: 'asc'},
  {field: 'field', direction: 'desc'}
]

// Short version
[
  'field',
  {field: 'field', direction: 'desc'}
]
```

### skip - optional
**Value:** 
number/integer - string/integer

**Description**:
By using *skip* you can choose your starting point in the dataset, most usefull for pagination

### limit - optional
**Value:** 
number/integer -  string/integer

**Description**:
The *limit* property gives you the ability to limit the amount of results in the dataset. Just like *skip* you can either pass an integer or a string.


##Examples

Let's get started!

### Get all creatures

Get all elements in the collection/class

**Publication:**

```javascript
{
  publicationName: [
    {
      collection: 'creature'
    }
  ]
}
```

**Output:**

Because no fields were defined everything is returned.


### Get all creatures with name and race

Get all elements in the collection/class with a defined projection.

**Publication:**

```javascript
{
  publicationName: [
    {
      collection: 'creature'
      fields: ['name', 'race']
    }
  ]
}
```

**Output:**

```javascript
[
	{
    	rid: '#11:0',
        name: 'Adalbert Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:1',
        name: 'Adaldrida Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:2',
        name: 'Adalgar Bolger',
        race: 'Hobbit'
    },
  	...
]
```

### Get all creatures with name and race order by name ascending and race descending

Get all elements in the collection/class with a defined projection and order on a field.

**Publication:**

```javascript
{
  publicationName: [
    {
      collection: 'creature'
      fields: ['name', 'race'],
      orderBy: ['name', {field: 'race', direction: 'desc'}]
    }
  ]
}
```

**Output:**

```javascript
[
	{
    	rid: '#11:0',
        name: 'Adalbert Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:1',
        name: 'Adaldrida Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:2',
        name: 'Adalgar Bolger',
        race: 'Hobbit'
    },
  	...
]
```

### Get all creatures with name and race skip and limit

Get all elements in the collection/class with a defined projection and skip elements and limit by 5.

Skip: 200

**Publication:**

```javascript
{
  publicationName: [
    {
      collection: 'creature'
      fields: ['name', 'race'],
      skip: 'skip',
      limit: 5
    }
  ]
}
```

**Output:**

```javascript
[
  {
        rid: '#11:200',
        name: 'Celeborn (White Tree)',
        race: 'Tree'
    },
    {
        rid: '#11:201',
        name: 'Celeborn',
        race: 'Sinda'
    },
    {
        rid: '#11:202',
        name: 'Celebrían',
        race: 'Falmar/Falas Elf'
    },
    {
        rid: '#11:203',
        name: 'Celebrimbor',
        race: 'Noldo'
    },
    {
        rid: '#11:204',
        name: 'Celebrindor',
        race: 'Arnorian'
    }
]
```

### Get creature where name equal to

Name: Boromir

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        ['name']
      ]
    }
  ]
}
```

**Output:**

```javascript
[
  	{
      	rid: '#11:166',
      	name: 'Boromir',
      	race: 'Gondorian'
  	}
]
```

### Get creatures where name not equal to

Name: Boromir

**Publication:**

```javascript
{
  publicationName: (creatureName) => {
  return ([
    {
      collection: 'creature'
      fields: ['name', 'race'],
      params: [
        name: creatureName
      ]
    }
  ]);
  }
}
```

**Output:**

```javascript
[
  {
        rid: '#11:0',
        name: 'Adalbert Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:1',
        name: 'Adaldrida Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:2',
        name: 'Adalgar Bolger',
        race: 'Hobbit'
    }
 ]
```

### Get creature where name equal to or equal to

Name one: Boromir
Name two: Adanel

**Publication:**

```javascript
{
  publicationName: (names) => {
  return ([
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        name: {
	  value: [names],
	  operator: ['in']
	}
      ]
    }
  ]);
  }
}
```

**Output:**

```javascript
[
  	{
        rid: '#11:5',
        name: 'Adanel',
        race: 'Adan'
    },
    {
        rid: '#11:166',
        name: 'Boromir',
        race: 'Gondorian'
    }
]
```

## Contributors

- [Jasper Dansercoer](http://www.jdansercoer.be/)
- [Ruben Vermeulen](https://rubenvermeulen.be/)
- [Michiel Cuvelier](https://www.linkedin.com/in/michiel-cuvelier-520a88111)
