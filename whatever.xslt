<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"
    xmlns:dyn="http://exslt.org/dynamic" extension-element-prefixes="dyn">
  <xsl:output omit-xml-declaration="yes" indent="no" method="text"/>
  <xsl:template match="/">
    <xsl:for-each select="dyn:evaluate($pattern)">
      <xsl:value-of select="dyn:evaluate($value)"/>
      <xsl:value-of select="'&#10;'"/>
    </xsl:for-each> 
  </xsl:template>
</xsl:stylesheet>
