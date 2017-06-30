

# GoldmineJS - Server

## Introduction

GoldmineJS is a framework for building reactive web apps in Javascript.

## Starting from scratch

We're going to build a GoldmineJS server which will serve the demo of the client package of GoldmineJS.

### Prerequisites

* Node.js installed
* npm package manager installed
* git installed
* A running OrientDB server
  * "Tolkien-Arda" database installed (freely available as a [public database](https://github.com/orientechnologies/public-databases))

### Installation

Clone the project to your local environment.

```
$ git clone https://gitlab.kayzr.com/ruben/gold-mine-js-web-socket.git
```

After you've cloned the project navigate to the folder and install all packages.

```
$ cd gold-mine-js-web-socket
$ npm install
```

### Configuration

Before running our server there are some things left to do. Go to th file *config.js* in the *src* folder. First of all we need to set the database information. For a local environment with a standard installation of OrientDB this will be the following.

```javascript
{
  database: {
    host: '127.0.0.1',
    port: '2424',
    name: 'Tolkien-Arda',
    username: 'admin',
    password: 'admin'
  }
}
```

Next we need to define which collections or classes the server can access.

```javascript
{
  collections: {
    CREATURE: {type: Types.VERTEX, name: 'creature'}
  }
}
```

The collections object will be used as an enum. The only two properties that are required are *type* and *name*. Type defines if the collection contains vertices or edges. The *name* property refers to the collection/class name in the database.

**TIP**

If you want to know how the queries that are build for each subscription looks like you can enable debugging by changing the *debug* property in the config.

### Publication

Now the configuration of our server is done there's on thing left to do. We need some publications. Publications define what we want from the database in a generic way. Clients can subscribe on these publications.

The publication we're going to build will fetch a creature based on a unique name. Publications can be found in the folder *src/publications*. The file *all.js* must contain all publications, feel free to create separate files for a cleaner structure, but these files must all be collected in *all.js*.

When you create a new publication you have to give it a name like in this example *getCreatureWithName*. The publication will always be an array with objects. This makes it possible to have multiple main queries in a single publication. For our example we only need one main query. 

```javascript
{
  getCreatureWithName: [
    {
      collectionName: 'creatures',
      collection: CollectionTypes.CREATURE,
      fields: ['name', 'born', 'gender', 'race', 'gatewaylink'],
      params: [
        ['name']
      ]
    }
  ]
}
```

### Start the server

The only thing left to do is running the server and connect your GoldmineJS client application.

```
$ npm start
```

### Conclusion

As you can see it is very easy to setup a GoldmineJS server. The example we've build is a very basic one. It is possible to build much more complex publications than the one we covered. You can find examples of different publications throughout this file.

You can find the complete example on [https://github.com/BeSports/Goldmine-Demo](https://github.com/BeSports/Goldmine-Demo).

## Publications

Publications are the most important part of the server. Without publications clients can't subscribe on the server and receive data. In this chapter we're going to discuss what's possible and what's not.

Below you can find the complete structure of a publication. Each property will be discussed in it's own section.

**PROPERTIES**

All properties with an ***** are mandatory.

* collectionName **(string)**
* collection* **(string)**
* fields **(array)**
* params **(array)**
* extend **(array)**
  * target* **(string)**
  * collection **(string)**
  * fields **(array)**
  * params **(array)**
  * relation* **(string)**
  * direction **(string)**
* orderBy **(array)**
* skip **(string)**
* limit **(integer | string)**

### collectionName

**Value:** 
string

**Necessity:** 
optional 

**Description**:
It is used to inform the client in which collection the data should be stored.

For example, when the *collectionName* is `users` the client will store the received data in the collection `users`.

### collection

**Value:** 
string

**Necessity:** 
mandatory 

**Description**:
The property *collection* defines in which collection/class the data has to be fetched. For instance, I want to fetch a user then I would search for a user in the `users` collection/class.

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
// Three elements
['field', '=', ':param']
['field', '<>', ':param']

['field', 'IN', ':param']
[':param', 'IN', 'field']

// Two elements
['field', 'IS NOT DEFINED']
['field', 'IS DEFINED']
...
```

 When you only use the '=' operator and the *field* and *param* names are equal you can use a short version. This **ONLY** applies to the '=' operator!

```javascript
// Long version
['field', '=', ':param']

// Short version
['field']
```

**Examples AND & OR operator:**

You can combine multiple rules with AND & OR operators just like in SQL.

```javascript
[
  ['field', '=', ':param'],
  'AND',
  ['field', '=', ':param'],
  'OR',
  ['field', '=', ':param']
]
```

Just like with the '=' operator there is a short version of the AND operator. This **ONLY** applies to the AND operator.

```javascript
// Long version
[
  ['field', '=', ':param'],
  'AND',
  ['field', '=', ':param']
]

// Short version
[
  ['field', '=', ':param'],
  ['field', '=', ':param']
]
```

**Examples nested rules:**

Sometimes it can be useful to put parentheses around rules to be sure the right elements are compared. To nest rules you just put them in another array.

```javascript
[
  [
    ['field', '=', ':param'],
    'OR',
    ['field', '=', ':param']
  ],
  'AND',
  [
    ['field', '=', ':param'],
    'OR',
    ['field', '=', ':param']
  ]
] 
```

**Supported filters:**

All filters with an ***** are rules with two elements in the array.

* AND, OR
* =, <>
* \>, <, >= , <=
* LIKE
* IN
* CONTAINSTEXT
* MATCHES
* IS DEFINED*****
* IS NOT DEFINED*****

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
    collection: {type: Types.VERTEX, name: 'user'},
    target: 'author',
    relation: 'AuthorOf',
    params: [
      ['username', '<>', ':username']
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

TODO

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

#### multi

**Value:** 
boolean

**Necessity:** 
optional

**Description**:
When you expect one result back from the extend you can set *multi* to *false*. Default results from the extend are stored in an array assigned to the *target* property. When *multi* is *false* the *target* property will contain an object and not an array.

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

## Cookbook

In this chapter you can find examples which shows what can be done with publications and what not. The examples are based on the "Tolkien-Arda" public database provided by OrientDB. You can run these examples by yourself and see the corresponding output.

The available collections/classes in the database are:

* Vertex
  * creature
  * event
  * location
* Edge
  * begets
  * hassibling
  * loves

The collections in the config file looks like this:

```javascript
collections: {
    CREATURE: {type: Types.VERTEX, name: 'creature'},
    EVENT: {type: Types.VERTEX, name: 'event'},
    LOCATION: {type: Types.VERTEX, name: 'location'},
    BEGETS: {type: Types.EDGE, name: 'begets'},
    HASSIBLING: {type: Types.EDGE, name: 'hassibling'},
    LOVES: {type: Types.EDGE, name: 'loves'},
}
```

**NOTE:** 

* Default the fields *@rid*, *@version* and *@type* are in the output for all queries. So we excluded them in the examples just for readability.
* The output given in the examples can be different from your output due to changes in the database.



Let's get started!

### Get all creatures

Get all elements in the collection/class.k

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'}
    }
  ]
}
```

**Output:**

Because no fields were defined only the rid is returned.

```javascript
[
  	{
    	rid: '#11:0',
  	},
  	{
    	rid: '#11:1'
  	},
  	...
]
```

### Get all creatures with name and race

Get all elements in the collection/class with a defined projection.

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
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
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
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
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
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
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        ['name', '<>', ':name']
      ]
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
    }
 ]
```

### Get creature where name equal to or equal to

Name one: Boromir
Name two: Adanel

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        ['name', '=', ':nameOne'],
        'OR',
        ['name', '=', ':nameTwo'],
      ]
    }
  ]
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

### Get creature where name equal to or equal to and gender male

Name one: Boromir (male)
Name two: Adanel (female)

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        [
          ['name', '=', ':nameOne'],
          'OR',
          ['name', '=', ':nameTwo']
        ],
        'AND',
        ['gender']
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

### Get creature where name in array

List names: Boromir, Adanel, Gerda Boffin, Meleth

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        ['name', 'IN', ':nameList']
      ]
    }
  ]
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
    },
    {
        rid: '#11:395',
        name: 'Gerda Boffin',
        race: 'Hobbit'
    },
    {
        rid: '#11:614',
        name: 'Meleth',
        race: 'Adan'
    }
]
```

### Get creature where location in array

The parameter is now the first in the rule when filtering on locations. As you can see you are free to switch the database field with the parameter given from the client.

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        [':location', 'IN', 'location']
      ]
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
        rid: '#11:2',
        name: 'Adalgar Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:19',
        name: 'Alfrida of the Yale',
        race: 'Hobbit'
    },
    {
        rid: '#11:27',
        name: 'Amethyst Hornblower',
        race: 'Hobbit'
    }
]
```

### Get creature and his/her loved on

This query can be resolved in two ways because we know that each person can only love one other person. 

#### #1

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        [':location', 'IN', 'location']
      ]
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
        rid: '#11:2',
        name: 'Adalgar Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:19',
        name: 'Alfrida of the Yale',
        race: 'Hobbit'
    },
    {
        rid: '#11:27',
        name: 'Amethyst Hornblower',
        race: 'Hobbit'
    }
]
```

#### #2

**Publication:**

```javascript
{
  publicationName: [
    {
      collectionName: 'creatures',
      collection: {type: Types.VERTEX, name: 'creature'},
      fields: ['name', 'race'],
      params: [
        [':location', 'IN', 'location']
      ]
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
        rid: '#11:2',
        name: 'Adalgar Bolger',
        race: 'Hobbit'
    },
    {
        rid: '#11:19',
        name: 'Alfrida of the Yale',
        race: 'Hobbit'
    },
    {
        rid: '#11:27',
        name: 'Amethyst Hornblower',
        race: 'Hobbit'
    }
]
```

### 

## Contributors

- [Jasper Dansercoer](http://www.jdansercoer.be/)
- [Ruben Vermeulen](https://rubenvermeulen.be/)