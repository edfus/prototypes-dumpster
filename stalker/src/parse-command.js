export function parseCommand (data) {
  const selfID = data.self_id;

  const messages = [ ...data.message ];
  const isAtMe = messages[0].type === "at" && messages[0].data.qq === selfID;

  if (isAtMe) {
    messages.shift();
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
      case "face":
        ;
        break;
      default:
        console.error("unknown type", message.type, "received in", message);
        break;
    }
  }

  return {
    command: command,
    commandText: commandText,
    "@me": isAtMe,
    isAtMe: isAtMe,
    "@": allAt,
    selfID: selfID,
    reply: data.reply,
    anonymous: data.anonymous,
    senderID: data.user_id,
    groupID: data.group_id,
    groupName: data.group_name,
    sender: data.sender
  };
}