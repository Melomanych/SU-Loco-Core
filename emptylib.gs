include "core.gs"
include "online.gs"

class emptylib isclass Library
{
  OnlineAccess OA;
  TTTEOnline onlineLibrary;

  public void Init(Asset asset)
  {
    inherited(asset);
    onlineLibrary = cast<TTTEOnline>World.GetLibrary(asset.LookupKUIDTable("onlinelibrary"));
  }

  public TTTEOnline GetOnlineLibrary()
  {
    return onlineLibrary;
  }
};
