
# deploy-from-npm

  Continuous deployment tool tailing npm.

## Usage

```bash
$ cd my-service

$ # use something like psy or forever to run your service
$ npm install -g psy
$ psy start -n my-service -- npm start

$ # use deploy-from-npm to restart it once a dependency has been updated
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
