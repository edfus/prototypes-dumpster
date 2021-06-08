let myNickName = "stalker";

export function parseCommand (data) { //TODO rename
  const selfID = data.self_id;

  const messages = [ ...data.message ];
  let isAtMe = messages[0].type === "at" && messages[0].data.qq === selfID;

  if (isAtMe && messages[0].data.text) {
    myNickName = messages[0].data.text.replace(/^@/, "");
  }

  if (isAtMe) {
    messages.shift();
  }

  if (!isAtMe && myNickName) {
    const toCompare =  `@${myNickName} `;
    if(messages[0].type === "text") {
      if(
        messages[0].data.text.trimStart().slice(0, toCompare.length)
        === toCompare
        ) {
        isAtMe = true;
        messages[0].data.text = messages[0].data.text.trimStart().slice(
          toCompare.length
        ).trimStart();
      }
    }
  }

  const allAt = [];
  const command = [];

  let commandText = "";
  for (const message of messages) {
    commandText += message.data.text || "";
    switch (message.type) {
      case "at":
        allAt.push(message.data.qq);
        command.push({
          type: "at",
          value: message.data.qq
        });
        break;
      case "text":
        command.push({
          type: "text",
          value: message.data.text.trimStart()
        });
        break;
      case "bface":
        break;
      case "face":
        break;
      case "reply":
        break;
      default:
        console.error("unknown type", message.type, "received in", message);
        break;
    }
  }

  commandText = commandText.replace(/^\s+/, "");

  return {
    command: command,
    commandText: commandText,
    "@me": isAtMe,
    isAtMe: isAtMe,
    "@": allAt,
    isFriend: data.message_type === "private" && data.sub_type === "friend",
    selfID: selfID,
    anonymous: data.anonymous,
    senderID: data.user_id,
    groupID: data.group_id,
    groupName: data.group_name,
    sender: data.sender
  };
}