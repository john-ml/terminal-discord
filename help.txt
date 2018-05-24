### Commands that always work

`servers`: List servers.

`server s c`: View a channel in a server where channel name contains `c` and server name contains `s`. If not specified, `c` is the empty string.

`direct-message s`: Open DMs between you and a user whose name contains `s`.

`pwd`: Print your current location (usually `/<server>/<channel>`).

`quit`: Quit.

`help`: Display this text.

### Commands that only work while already in a channel

`channels`: List all other channels in the current server.

`channel c`: View a channel in the current server where channel name contains `c`.

`image path`: Attach an image.

`refresh`: Refetch latest messages.

`delete k n`: Delete your `k`th most recent message. Search through `n` messages to find the one to delete (if not specified, `n` = 10).

`edit`: Enter "edit mode." In this mode, the message being edited is highlighted and its contents are copied into the input buffer for editing. Hotkeys are rebound to move between past messages and finalize edits.

`at s ...`: Send a message mentioning a user whose name contains `s` with content `...`. For example, `/at user hello` might send `@user, hello`.

### Command aliases

Every command as a 1-2 letter alias:

`ss` → `servers`
`s` → `server`
`dm` → `direct-message`
`p` → `pwd`
`q` → `quit`
`h` → `help`
`cs` → `channels`
`c` → `channel`
`i` → `image`
`r` → `refresh`
`d` → `delete`
`e` → `edit`
`a` → `at`
