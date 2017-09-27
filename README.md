

# GoldmineJS - Server

[![NPM](https://nodei.co/npm/goldmine-server.png?downloads=true&downloadRank=true)](https://nodei.co/npm/goldmine-server/)

Documentation needs to be updated, if you would like to use the newer version, wait until it gets updated or contact [me](mailto:michiel@kayzr.com) for instant updates

## Introduction

GoldmineJS is a framework for building reactive web apps in Javascript.

## Starting from scratch

We're going to build a GoldmineJS server which will serve the demo of the client package of GoldmineJS.

### Prerequisites

* [Node.js](https://nodejs.org/en/)
* npm package manager installed
* [Git](https://git-scm.com/) installed
* A running OrientDB server
  * "Tolkien-Arda" database installed (freely available as a [public database](https://github.com/orientechnologies/public-databases))

### Installation

```
$ npm install Goldmine-Server
```

## Configuration

### Database Configuration

Before running our server there are some things left to do. Since we have to initialize our connection to orientdb, put in our credentials and logging options.

```javascript
const config = {
  // General
  port: 3021, // Port on which to run the goldmine-server

  // Database
  database: { // Your database credentials
    host: '127.0.0.1',
    port: 2424,
    name: 'MyDatabase',
    username: 'server',
    password: 'changethissecurepassword',
  },

  logging: {
    connections: false,	// toggle loggin on connection open/close
    authentication: false, // toggle authentication logging
    subscriptions: false, // toggle the logging of new subscriptions, deleting subsscriptions
    publications: false, // toggle the logging of what is published
    statistics: false, // toggle the statistics log
    repeat: 10000, // timer between each stats log
  },
};
```

### Publications Config

Next we make a publications object on which clients can subscribe and receive their data for.
The keys of this object are the names of the publications.


When you create a new publication you have to give it a name like in this example *getAllUserIds*. The publication will always be an array with objects, a function returning an array with objects. This makes it possible to have multiple main queries in a single publication. For our example we only need one main query. 

```javascript
const publications = {
  getAllUserIds: () => {
   return ([
      {
        collection: 'user',
      	fields: ['_id'],
      }
    ]);
  }
}
```

This subscription would execute the query `SELECT _id from user`;


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
* fields **(array)**
* params **(array)**
* edgeFields ** array **
* extend **(array)**
  * target* **(string)**
  * collection* **(string)**
  * fields **(array)**
  * params **(array)**
  * relation* **(string)**
* orderBy **(array)**
* skip **(string)**
* limit **(integer | string)**

### collection

**Value:** 
string

**Necessity:** 
mandatory 

**Description**:
The property *collection* defines in which collection/class the data has to be fetched. For instance, I want to fetch a user then I would search for a user in the `user` collection/class.

### fields

**Value:** 
array

**Necessity:** 
optional 

**Description**:
The *fields* property provides the ability to select which fields should be returned. When this property isn't defined only the IDs will be returned.

For example: `['username', 'description', 'lastSeen']`

### params

**Value:** 
array

**Necessity:** 
optional

**Description**:
The property *params* makes it possible to filter through the data. The array is very flexible but can be rather complex when you first use it. It's important to know that a rule in *params* is an array that contains two or three elements. When referring to a field in the database you use the name of that field. Whenever referring to a parameter that will be passed into the resolver you start it with a colon (:).

You can find a list of all the filters after the examples.

**Examples rules:**

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

//Search where somthing doesn't exist
{
  verifiedMail: {
    operator: 'IS NOT DEFINED',
  },
},
...
```

### extend

**Value:** 
array

**Necessity:** 
optional

**Description**:
An extend makes it possible to fetch data that is connect with each other. You can make a comparison with JOINs in SQL. Just like multiple main queries you can have multiple extends.

Example for a full extend:

```javascript
extend: [
  {
    collection: 'user',
    target: 'friend',
    relation: 'user_user_following',
    params: [
      verifiedMail: true
    ]
  }
]
```

#### target

**Value:** 
string

**Necessity:** 
mandatory

**Description**:
The *target* property defines where the dataset of the extend must store his data for each element.


#### relation 

**Value:** 
string

**Necessity:** 
mandatory

**Description**:
Specific for a GraphDB the name of the relation is necessary.

#### direction

**Value:** 
string

**Necessity:** 
optional

**Description**:
Specific for a GraphDB it can be necessary to define the direction of traversing.
This is currently being autoset to BOTH, but will come back to in and out in the future

#### multi

**Value:** 
boolean

**Necessity:** 
optional

**Description**:
When you expect one result back from the extend you can set *multi* to *false*. Default results from the extend are stored in an object assigned to the *target* property. When *multi* is *true* the *target* property will contain an array and not an object.

### orderBy

**Value:** 
array

**Necessity:** 
optional

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

### skip

**Value:** 
string

**Necessity:** 
optional

**Description**:
By using *skip* you can choose your starting point in the dataset. 

```javascript
skip: 'skip'
```

### limit

**Value:** 
integer | object

**Necessity:** 
optional

**Description**:
The *limit* property gives you the ability to limit the amount of results in the dataset. Just like *skip* you can either pass an integer or a string. The integer will make it a hard limit and the string will make it dynamic.

```javascript
limit: 10
limit: 'limit'
```

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
