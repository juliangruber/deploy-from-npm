
# deploy-from-npm

  Continuous deployment tool using npm.
  
  Watches npm for all updates to top level dependencies, then if there's a match it runs tests, upgrades your app and
  fires your restart command.

  ![](https://usercontent.irccloud-cdn.com/file/JXWnxpnW/Screen%20Shot%202016-08-13%20at%2014.56.31.png)

## Usage

```bash
$ cd my-service

$ # use something like psy or forever to run your service
$ npm install -g psy
$ psy start -n my-service -- npm start

$ # use deploy-from-npm to restart it once a dependency has been updated
$ npm install -g deploy-from-npm
$ deploy-from-npm . "psy restart my-service"
```

And in general:

```bash
$ deploy-from-npm

Usage:

  $ deploy-from-npm DIR RELOAD

Example:

  $ deploy-from-npm /srv/my-service "kill $server-pid"

```

## Installation

```bash
$ npm install -g deploy-from-npm
```

## Kudos

  This was [@mafintosh](https://github.com/mafintosh)'s idea, I'm just implementing it.

## License

  MIT
