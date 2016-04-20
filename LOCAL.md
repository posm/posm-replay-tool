## OSM Databases

* `osm_posm` - Missing Maps edits from Ecuador, loading from an APIDB backup
* `osm_upstream` - OSM as of 4/7/16

## Initialization

```bash
cd /path/to/openstreetmap-website

# prepare the POSM data
DATABASE_URL=postgres:///osm_posm bundle exec rake db:create
gzip -dc osm-201603230942.sql.gz | psql -d osm_posm

# prepare the upstream data
DATABASE_URL=postgres:///osm_upstream bundle exec rake db:create && \
  psql -d osm_upstream -c "CREATE EXTENSION btree_gist" && \
  DATABASE_URL=postgres:///osm_upstream bundle exec rake db:migrate

echo "(node(-3.515306,-80.259418,-3.447453,-80.184231);<;>>;>;);out meta;" > huaquillas.overpass
wget -O huaquillas-201604071225.xml --post-file=huaquillas.overpass http://overpass-api.de/api/interpreter

# load upstream data into osm_upstream
osmosis --truncate-apidb database=osm_upstream validateSchemaVersion=no \
  --read-xml huaquillas-201604071225.xml \
  --log-progress \
  --write-apidb database=osm_upstream validateSchemaVersion=no
```

If Osmosis throws an error like the following, it means that the OSM extract
you're working with has multiple users (identified by `uid`) with the same
username (`user`).

```
org.openstreetmap.osmosis.core.OsmosisRuntimeException: Unable to insert user with id 1708958 into the database.
	at org.openstreetmap.osmosis.apidb.v0_6.impl.UserManager.insertUser(UserManager.java:143)
	at org.openstreetmap.osmosis.apidb.v0_6.impl.UserManager.addOrUpdateUser(UserManager.java:191)
	at org.openstreetmap.osmosis.apidb.v0_6.ApidbWriter.process(ApidbWriter.java:1098)
	at org.openstreetmap.osmosis.core.progress.v0_6.EntityProgressLogger.process(EntityProgressLogger.java:71)
	at org.openstreetmap.osmosis.xml.v0_6.impl.NodeElementProcessor.end(NodeElementProcessor.java:139)
	at org.openstreetmap.osmosis.xml.v0_6.impl.OsmHandler.endElement(OsmHandler.java:107)
	at org.apache.xerces.parsers.AbstractSAXParser.endElement(Unknown Source)
	at org.apache.xerces.impl.XMLDocumentFragmentScannerImpl.scanEndElement(Unknown Source)
	at org.apache.xerces.impl.XMLDocumentFragmentScannerImpl$FragmentContentDispatcher.dispatch(Unknown Source)
	at org.apache.xerces.impl.XMLDocumentFragmentScannerImpl.scanDocument(Unknown Source)
	at org.apache.xerces.parsers.XML11Configuration.parse(Unknown Source)
	at org.apache.xerces.parsers.XML11Configuration.parse(Unknown Source)
	at org.apache.xerces.parsers.XMLParser.parse(Unknown Source)
	at org.apache.xerces.parsers.AbstractSAXParser.parse(Unknown Source)
	at org.apache.xerces.jaxp.SAXParserImpl$JAXPSAXParser.parse(Unknown Source)
	at org.apache.xerces.jaxp.SAXParserImpl.parse(Unknown Source)
	at javax.xml.parsers.SAXParser.parse(SAXParser.java:195)
	at org.openstreetmap.osmosis.xml.v0_6.XmlReader.run(XmlReader.java:111)
	at java.lang.Thread.run(Thread.java:745)
Caused by: org.postgresql.util.PSQLException: ERROR: duplicate key value violates unique constraint "users_display_name_idx"
  Detail: Key (display_name)=(Nodes&Roads) already exists.
	at org.postgresql.core.v3.QueryExecutorImpl.receiveErrorResponse(QueryExecutorImpl.java:2270)
	at org.postgresql.core.v3.QueryExecutorImpl.processResults(QueryExecutorImpl.java:1998)
	at org.postgresql.core.v3.QueryExecutorImpl.execute(QueryExecutorImpl.java:255)
	at org.postgresql.jdbc2.AbstractJdbc2Statement.execute(AbstractJdbc2Statement.java:570)
	at org.postgresql.jdbc2.AbstractJdbc2Statement.executeWithFlags(AbstractJdbc2Statement.java:420)
	at org.postgresql.jdbc2.AbstractJdbc2Statement.executeUpdate(AbstractJdbc2Statement.java:366)
	at org.openstreetmap.osmosis.apidb.v0_6.impl.UserManager.insertUser(UserManager.java:140)
	... 18 more
```

In this case, `1708958`'s username (`Nodes&Roads`) is a duplicate, though we
don't yet know which is the correct one. To find out, let's `grep` for it (n.b.:
since it includes an `&`, we need to escape it), excluding the one we already
know about:

```bash
grep 'user="Nodes&amp;Roads"' huaquillas-201604071225.xml | \
  grep -v 'uid="1708958"' | \
  head -1
```

Aha, `3642735`. Let's consult the OSM API to find out what the usernames really
are:

```bash
curl http://www.openstreetmap.org/api/0.6/user/1708958

curl http://www.openstreetmap.org/api/0.6/user/3642735
```

Ok, now we know that `1708958` is actually `georhoko` and `3642735` is
`Nodes&Roads`. We can now use that information to fix the OSM XML and allow
Osmosis to import correctly (or flag another duplicate user):

```bash
cat huaquillas-201604071225.xml | \
  ./remap-userid.sh 1708958 georhoko > huaquillas-201604071225-fixed.xml

osmosis --truncate-apidb database=osm_upstream validateSchemaVersion=no \
  --read-xml huaquillas-201604071225-fixed.xml \
  --log-progress \
  --write-apidb database=osm_upstream validateSchemaVersion=no
```

You'll need to update the sequences in order for new IDs to be assigned
appropriately:

```bash
export PGDATABASE=osm_upstream
psql -c "select setval('changesets_id_seq', (select max(id) from changesets))"
psql -c "select setval('current_nodes_id_seq', (select max(node_id) from nodes))"
psql -c "select setval('current_ways_id_seq', (select max(way_id) from ways))"
psql -c "select setval('current_relations_id_seq', (select max(relation_id) from relations))"
psql -c "select setval('users_id_seq', (select max(id) from users))"
```

To keep working, you'll want 2 versions of `openstreetmap-website` running, one
against each database.

```bash
# start an instance w/ POSM data on :3000
DATABASE_URL=postgres:///osm_posm bundle exec rails server \
  -p 3000 \
  -b 0.0.0.0 \
  -P tmp/pids/posm.pid

# create a POSM user (to allow auth to be bypasses)
DATABASE_URL=postgres:///osm_upstream bundle exec rake osm:users:create display_name='POSM' description='Portable OpenStreetMap'

# start an instance w/ upstream data on :3001
OSM_POSM_USER=POSM DATABASE_URL=postgres:///osm_upstream bundle exec rails server \
  -p 3001 \
  -b 0.0.0.0 \
  -P tmp/pids/upstream.pid
```

Gather local changesets starting with the first local changeset. You can
identify the first local changeset by querying for the first changeset w/ more
than 0 changes:

```bash
psql -d osm_posm -t -c "select id from changesets where num_changes > 0 order by id asc limit 1"
```

In this case, the first local changeset is `37765184`. We can now gather
changesets from the OSM API w/ POSM data into the `changesets/` directory by
doing:

```bash
OSM_BASE_URL=http://localhost:3000 ./gather_changesets.sh 37765184
```

This will run for a while, depending on the number of local changes that were
made.

Now, initialize the working repo. This will convert the PBF starting point to
XML, format it using `tidy` (for cleaner diffs), and create an initial commit.

```bash
REPO=posm ./initialize-repo.sh huaquillas-fixed.pbf
```

Preprocess the changesets we previously gathered into git commits:

```bash
REPO=posm ./preprocess-changesets.sh changesets
```

This will take a while as each changeset is applied to the previous state of the
world. Changeset comments (including tags) will be used as commit messages.

TODO deal if a digit is added to a changeset id (`sort -g`?) and continue to
apply changesets in the correct order.

TODO renumber adds here (so that XML diffs will reflect the correct IDs) and track ID mappings

Now we have a git repository we can navigate through efficiently and rebase.

TODO try renumbering w/ a `rebase -i` to see if subsequent commits pick it up.

They see it as conflicts, which need to be resolved manually (updated id from
upstream, updated everything else from the commit). This also does not pick up
refs to the original node id.

---

We'll now create a similar repository for tracking / simulating the upstream
state. This will give us a sense of whether changesets will apply before we
attempt to send them to an actual API endpoint.

```bash
REPO=upstream ./initialize-repo.sh huaquillas-201604071225-fixed.xml
```

TODO allow this to share history with the starting point (same as if we'd applied upstream changesets to our local version)

---

Let's now try walking through the POSM commits and applying them to the `upstream` repo.

```bash
# grab the first unapplied changeset
sha1=$(git log --reverse --format=%h start..@ | head -1)

# check that it's what you expected
git show $sha1

# fetch the upstream repo into this so we can more easily apply changes
# this will create an upstream branch
git fetch ../upstream/ master:upstream

# switch branches
git checkout upstream

# merge the first changeset
# the recursive merge strategy is used, preferring local commits
git merge $sha1 -s recursive -X ours
```
